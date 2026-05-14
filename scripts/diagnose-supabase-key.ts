// Diagnose the SUPABASE_SERVICE_ROLE_KEY env var.
// Run: npx tsx scripts/diagnose-supabase-key.ts

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

console.log("\n=== Key format ===");
console.log("Length:", key.length);
console.log("Prefix (first 20 chars):", key.slice(0, 20));
console.log("Suffix (last 8 chars):", key.slice(-8));

if (key.startsWith("sb_publishable_")) {
  console.log("⚠ This is a PUBLISHABLE key (frontend / RLS-applies). NOT bypass.");
  console.log("  → Replace with a `sb_secret_...` key from Supabase → Project Settings → API Keys.");
}
if (key.startsWith("sb_secret_")) {
  console.log("✓ This is a SECRET key (backend / bypasses RLS).");
}
if (key.startsWith("eyJ")) {
  console.log("→ Looks like a legacy JWT. Decoding payload…");
  try {
    const [, payload] = key.split(".");
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const b64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    console.log("Decoded payload:", JSON.stringify(json, null, 2));
    if (json.role === "service_role") {
      console.log("✓ Legacy service_role key. Bypasses RLS.");
    } else if (json.role === "anon") {
      console.log("⚠ Legacy ANON key. RLS APPLIES. NOT bypass.");
      console.log("  → Replace with the service_role key from Supabase dashboard.");
    } else {
      console.log("⚠ Unknown role:", json.role);
    }
  } catch (err) {
    console.log("✗ Could not decode JWT:", err instanceof Error ? err.message : err);
  }
}

console.log("\n=== Storage upload probe ===");
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const probePath = `__diag__/probe-${Date.now()}.txt`;
const { error: uploadErr } = await supabase.storage
  .from("storyboards")
  .upload(probePath, Buffer.from("ping", "utf8"), {
    contentType: "text/plain",
    upsert: true,
  });

if (uploadErr) {
  console.log("✗ Upload failed:");
  console.log("  message:", uploadErr.message);
  console.log("  name:", uploadErr.name);
  if (uploadErr.message.includes("row-level security")) {
    console.log("  → RLS is blocking this key. Use service_role / secret key, OR add a policy.");
  }
} else {
  console.log("✓ Upload succeeded at:", probePath);
  // Cleanup
  await supabase.storage.from("storyboards").remove([probePath]);
}

console.log("\n=== Auth probe (does this key have privileged claims?) ===");
const { data: bucketList, error: bucketErr } = await supabase.storage.listBuckets();
if (bucketErr) {
  console.log("✗ listBuckets failed (anon/publishable keys cannot list):", bucketErr.message);
  console.log("  → Confirms the key is NOT service_role.");
} else {
  console.log("✓ listBuckets returned", bucketList?.length ?? 0, "buckets — this key has admin scope.");
}
