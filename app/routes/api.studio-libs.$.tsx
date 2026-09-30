import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Route } from "./+types/api.studio-libs.$";
import { resolveStudioLibsDir } from "../lib/studio/browser";

// GET /api/studio-libs/* → the vendored libraries for the preview iframe.
//
// The preview document runs in <iframe sandbox="allow-scripts">, i.e. an opaque
// origin, so ES-module scripts (three, simplex-noise) and fonts are fetched in
// CORS mode and need Access-Control-Allow-Origin. Static files from public/
// can't carry that header under react-router-serve, so the document route
// rewrites /studio-libs/ to this path. The renderer serves /studio-libs/
// itself and never hits this route.

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};

export async function loader({ params }: Route.LoaderArgs) {
  const root = resolveStudioLibsDir();
  const rel = params["*"] ?? "";
  const ext = path.extname(rel).toLowerCase();
  if (!root || !rel || !MIME[ext]) return new Response("Not found", { status: 404 });

  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(file);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": MIME[ext],
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
