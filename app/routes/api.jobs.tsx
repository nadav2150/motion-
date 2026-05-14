import type { Route } from "./+types/api.jobs";
import { createJob, runJob } from "../lib/jobs";
import { getUserFromRequest } from "../lib/auth";

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

  const {
    script,
    productDescription,
    brandStyle,
    brandLogoUrl,
    brandLogoStoragePath,
    brandColors,
  } = (body ?? {}) as {
    script?: unknown;
    productDescription?: unknown;
    brandStyle?: unknown;
    brandLogoUrl?: unknown;
    brandLogoStoragePath?: unknown;
    brandColors?: unknown;
  };

  if (typeof script !== "string" || !script.trim()) {
    return Response.json({ error: "script (string) is required" }, { status: 400 });
  }

  const cleanedColors = Array.isArray(brandColors)
    ? brandColors
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toLowerCase())
        .filter((c) => /^#[0-9a-f]{6}$/.test(c))
    : null;

  try {
    const user = await getUserFromRequest(request);
    const { jobId } = await createJob({
      script,
      productDescription: typeof productDescription === "string" ? productDescription : undefined,
      brandStyle: typeof brandStyle === "string" ? brandStyle : undefined,
      brandLogoUrl: typeof brandLogoUrl === "string" ? brandLogoUrl : null,
      brandLogoStoragePath:
        typeof brandLogoStoragePath === "string" ? brandLogoStoragePath : null,
      brandColors: cleanedColors,
      userId: user?.id ?? null,
    });

    // Fire-and-forget: the worker runs in the same process. The dev server
    // keeps the process alive, so this completes long after the response is
    // sent. The client polls /api/jobs/:id for status.
    void runJob(jobId).catch((err) => {
      console.error("runJob threw:", err);
    });

    return Response.json({ jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/jobs POST failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
