import type { Route } from "./+types/api.brand.scrape";
import { scrapeBrand } from "../lib/brand-scrape";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url } = (body ?? {}) as { url?: unknown };
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "url (string) is required" }, { status: 400 });
  }

  try {
    const result = await scrapeBrand(url.trim());
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
