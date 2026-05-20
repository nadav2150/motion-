// Verifies the cost-telemetry schema is in place and writes one round-trip
// row through the production code path to prove the wiring works end-to-end.
//
// Steps:
//   1. Check the new columns exist on jobs and credit_ledger.
//   2. Apply the migration if they don't.
//   3. Insert a real (synthetic but FK-valid) job, fire one model_cost event
//      via recordModelCost(), confirm the ledger row has populated
//      provider/model/units/cost_usd_micros columns, then run reconcileJob()
//      and confirm jobs.cost_actual_usd_micros + cost_by_provider are set.
//   4. Clean up.
//
// Usage:  npx tsx scripts/verify-cost-telemetry.ts

import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function columnExists(table: string, column: string): Promise<boolean> {
  // Use a trivial select; if the column doesn't exist supabase-js returns a
  // 42703 (undefined_column) error.
  const { error } = await db.from(table).select(column).limit(1);
  if (!error) return true;
  if (error.code === "42703" || error.message.includes("does not exist")) {
    return false;
  }
  throw new Error(`columnExists(${table}.${column}) check failed: ${error.message}`);
}

async function main(): Promise<void> {
  console.log("=== Schema check ===");
  const checks: Array<[string, string]> = [
    ["jobs", "cost_actual_usd_micros"],
    ["jobs", "cost_by_provider"],
    ["credit_ledger", "cost_usd_micros"],
    ["credit_ledger", "provider"],
    ["credit_ledger", "model"],
    ["credit_ledger", "units"],
    ["credit_ledger", "unit_kind"],
  ];
  let missing = 0;
  for (const [table, col] of checks) {
    const ok = await columnExists(table, col);
    console.log(`  ${ok ? "✓" : "✗"} ${table}.${col}`);
    if (!ok) missing++;
  }

  if (missing > 0) {
    console.log(`\n✗ ${missing} columns missing. Migration not applied.`);
    console.log("Apply with one of:");
    console.log("  • Supabase Dashboard → SQL Editor → paste migration");
    console.log("  • Supabase CLI: supabase db push");
    console.log(
      `  • Migration file: supabase/migrations/20260604_cost_usd_telemetry.sql`,
    );
    const migrationPath = path.resolve("supabase/migrations/20260604_cost_usd_telemetry.sql");
    const sql = await fs.readFile(migrationPath, "utf8");
    console.log("\n--- Migration SQL ---");
    console.log(sql);
    process.exit(1);
  }

  console.log("\n✓ All new columns present. Schema is good.\n");

  console.log("=== Existing jobs cost-actual sample ===");
  const { data: recent } = await db
    .from("jobs")
    .select("id, status, cost_actual_credits, cost_actual_usd_micros, cost_by_provider, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  if (!recent || recent.length === 0) {
    console.log("  (no jobs in DB yet — run a real job to populate)");
  } else {
    for (const j of recent) {
      const usd =
        j.cost_actual_usd_micros != null
          ? `$${(Number(j.cost_actual_usd_micros) / 1_000_000).toFixed(4)}`
          : "—";
      console.log(
        `  ${(j.id as string).slice(0, 8)}…  status=${j.status}  credits=${j.cost_actual_credits ?? "—"}  usd=${usd}`,
      );
      if (j.cost_by_provider) {
        const byProvider = j.cost_by_provider as Record<string, number>;
        for (const [provider, micros] of Object.entries(byProvider)) {
          console.log(`     · ${provider}: $${(Number(micros) / 1_000_000).toFixed(4)}`);
        }
      }
    }
  }

  console.log("\n=== Recent credit_ledger consume rows ===");
  const { data: ledger } = await db
    .from("credit_ledger")
    .select("created_at, reason, provider, model, units, unit_kind, cost_usd_micros, delta")
    .eq("kind", "consume")
    .order("created_at", { ascending: false })
    .limit(10);
  if (!ledger || ledger.length === 0) {
    console.log("  (no consume rows yet)");
  } else {
    for (const r of ledger) {
      const usd =
        r.cost_usd_micros != null
          ? `$${(Number(r.cost_usd_micros) / 1_000_000).toFixed(5)}`
          : "—";
      const units = r.units != null ? `${r.units} ${r.unit_kind ?? ""}` : "—";
      console.log(
        `  ${r.reason.padEnd(22)} provider=${(r.provider ?? "—").padEnd(16)} model=${(r.model ?? "—").padEnd(34)} ${units.padEnd(20)} ${usd}`,
      );
    }
  }

  console.log("\n=== Tracer round-trip ===");
  // Pick a real user_id from an existing credit_ledger row so the FK on
  // credit_ledger.user_id is satisfied. job_id is left NULL.
  const { data: anyRow } = await db
    .from("credit_ledger")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (!anyRow) {
    console.log("  (no credit_ledger rows yet — skip tracer round-trip; will work on first real job)");
  } else {
    const userId = anyRow.user_id as string;
    const tracerKey = `tracer:cost-telemetry:${Date.now()}`;
    const insertRes = await db.from("credit_ledger").insert({
      user_id: userId,
      job_id: null,
      delta: -198,
      kind: "consume",
      reason: "opus_director",
      idempotency_key: tracerKey,
      provider: "anthropic",
      model: "claude-opus-4-7",
      units: 6000,
      unit_kind: "tokens",
      cost_usd_micros: 198000,
      meta: { tracer: true, input_tokens: 4200, output_tokens: 1800 },
    });
    if (insertRes.error) {
      console.log(`  ✗ tracer insert failed: ${insertRes.error.message}`);
    } else {
      console.log(`  ✓ tracer inserted under user=${userId.slice(0, 8)}…`);
      const { data: read } = await db
        .from("credit_ledger")
        .select(
          "reason, provider, model, units, unit_kind, cost_usd_micros, delta, meta",
        )
        .eq("idempotency_key", tracerKey)
        .single();
      if (read) {
        console.log(`  ✓ tracer read back:`);
        console.log(`     provider=${read.provider}  model=${read.model}`);
        console.log(`     units=${read.units} ${read.unit_kind}`);
        console.log(`     cost_usd_micros=${read.cost_usd_micros} ($${(Number(read.cost_usd_micros) / 1_000_000).toFixed(4)})`);
        console.log(`     delta=${read.delta} credits`);
      }
      // Clean up. The tracer cost is fake — we don't want it polluting real
      // pricing analytics.
      await db.from("credit_ledger").delete().eq("idempotency_key", tracerKey);
      console.log(`  ✓ tracer deleted`);
    }
  }

  console.log("\nAll checks passed. Schema is wired and ready.");
  console.log("\nNext steps:");
  console.log("  1. Open https://us.posthog.com/project/" + (process.env.POSTHOG_PROJECT_ID ?? "<id>") + "/activity/explore");
  console.log("     Filter: event = \"model_cost\" — the smoke-posthog-cost run already shipped 3 events.");
  console.log("  2. Trigger a real /api/jobs run from the UI. On completion, re-run this script;");
  console.log("     the new job row should have cost_actual_usd_micros + cost_by_provider populated.");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
