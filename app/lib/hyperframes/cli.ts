// Single source of truth for spawning the HeyGen HyperFrames CLI.
//
// Pinned + `--yes` so every render/lint runs against the exact version we
// tested, and so a clean environment never hangs on an npx install prompt.
// Matches hf-example/package.json (hyperframes@0.6.6).

export const HYPERFRAMES_VERSION = "0.6.6";

/** npx is a .cmd shim on Windows; spawn it with shell:true there. */
export function hyperframesBin(platform: NodeJS.Platform | string = process.platform): string {
  return platform === "win32" ? "npx.cmd" : "npx";
}

/**
 * Build the argv for `npx --yes hyperframes@<pinned> <subcommand> <...rest>`.
 * `--yes` must precede the package spec so npx auto-installs without prompting.
 */
export function hyperframesArgs(subcommand: string, rest: string[] = []): string[] {
  return ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, subcommand, ...rest];
}
