// Verifies the backoffice admin gating + impersonation handoff-token logic
// without touching the database. Exits non-zero on any failed assertion.
//
// Usage:  npx tsx scripts/verify-impersonation-token.ts

process.env.IMPERSONATION_SECRET = "test-secret-do-not-use-in-prod";
process.env.ADMIN_EMAILS = "Admin@Videly.io, owner@videly.io";

import { isAdmin } from "../app/lib/admin";
import { signHandoff, verifyHandoff, type HandoffPayload } from "../app/lib/impersonation";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failures++;
  }
}

console.log("isAdmin (ADMIN_EMAILS allowlist, case-insensitive):");
check("admin email matches (different case)", isAdmin("admin@videly.io"));
check("second allowlisted email matches", isAdmin("owner@videly.io"));
check("non-admin rejected", !isAdmin("someone@example.com"));
check("null rejected", !isAdmin(null));
check("empty rejected", !isAdmin(""));

console.log("\nhandoff token sign/verify round-trip:");
const payload: Omit<HandoffPayload, "exp"> = {
  access_token: "acc-123",
  refresh_token: "ref-456",
  expires_in: 3600,
  admin_refresh: "admin-ref-789",
  target_email: "target@example.com",
  admin_email: "admin@videly.io",
};
const token = signHandoff(payload);
const decoded = verifyHandoff(token);
check("verifies a freshly signed token", decoded !== null);
check("round-trips access_token", decoded?.access_token === "acc-123");
check("round-trips admin_refresh", decoded?.admin_refresh === "admin-ref-789");
check("round-trips target_email", decoded?.target_email === "target@example.com");

console.log("\nhandoff token rejects tampering + expiry:");
check("rejects a tampered body", verifyHandoff(token.replace(/^.{10}/, "AAAAAAAAAA")) === null);
check("rejects a tampered signature", verifyHandoff(token.slice(0, -4) + "0000") === null);
check("rejects garbage", verifyHandoff("not-a-token") === null);
check("rejects empty", verifyHandoff("") === null);

// Hand-forge an expired token signed with the same secret.
const { createHmac } = await import("node:crypto");
const expired: HandoffPayload = { ...payload, exp: Math.floor(Date.now() / 1000) - 10 };
const body = Buffer.from(JSON.stringify(expired)).toString("base64url");
const sig = createHmac("sha256", process.env.IMPERSONATION_SECRET!).update(body).digest("base64url");
check("rejects an expired (but validly signed) token", verifyHandoff(`${body}.${sig}`) === null);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
