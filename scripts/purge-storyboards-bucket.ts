// Delete every object in the Supabase `storyboards` bucket.
//
// DESTRUCTIVE. Requires --yes to actually run. Without the flag it lists
// what would be deleted so you can preview the blast radius first.
//
// Run with:
//   npx tsx scripts/purge-storyboards-bucket.ts          # dry-run (list only)
//   npx tsx scripts/purge-storyboards-bucket.ts --yes    # actually delete

import "dotenv/config";
import { getSupabase } from "../app/lib/supabase";
import { STORYBOARDS_BUCKET } from "../app/lib/storage";

async function listAllPaths(prefix: string): Promise<string[]> {
  const db = getSupabase();
  const collected: string[] = [];
  const stack: string[] = [prefix];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    const { data, error } = await db.storage
      .from(STORYBOARDS_BUCKET)
      .list(dir, { limit: 1000 });
    if (error) {
      console.warn(`[purge] list("${dir}") failed: ${error.message}`);
      continue;
    }
    for (const entry of data ?? []) {
      const full = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.id === null && !entry.metadata) {
        stack.push(full);
      } else {
        collected.push(full);
      }
    }
  }
  return collected;
}

async function main() {
  const confirm = process.argv.includes("--yes");
  const db = getSupabase();

  console.log(`[purge] scanning bucket "${STORYBOARDS_BUCKET}"...`);
  const paths = await listAllPaths("");
  console.log(`[purge] found ${paths.length} object(s)`);

  if (paths.length === 0) return;

  if (!confirm) {
    const preview = paths.slice(0, 20);
    for (const p of preview) console.log(`  ${p}`);
    if (paths.length > preview.length) {
      console.log(`  ... and ${paths.length - preview.length} more`);
    }
    console.log(
      `\n[purge] dry-run only. Re-run with --yes to delete all ${paths.length} object(s).`,
    );
    return;
  }

  // Supabase remove() caps at ~1000 paths per call; chunk to be safe.
  const CHUNK = 500;
  let deleted = 0;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    const { data, error } = await db.storage
      .from(STORYBOARDS_BUCKET)
      .remove(chunk);
    if (error) {
      console.warn(
        `[purge] chunk ${i}-${i + chunk.length} failed: ${error.message}`,
      );
      continue;
    }
    deleted += data?.length ?? chunk.length;
    console.log(`[purge] deleted ${deleted}/${paths.length}`);
  }
  console.log(`[purge] done. Deleted ${deleted}/${paths.length} object(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
