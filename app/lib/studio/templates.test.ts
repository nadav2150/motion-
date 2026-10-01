import { describe, expect, it } from "vitest";
import { listTemplates, templateSourceJob } from "./templates";

describe("templates", () => {
  it("every template has an example video, a poster and a source job to open in the editor", () => {
    for (const t of listTemplates()) {
      expect(t.previewVideoUrl, t.id).toMatch(/^https:\/\/.+\.mp4\?v=\d+$/);
      expect(t.posterUrl, t.id).toMatch(/^https:\/\/.+\.jpg\?v=\d+$/);
      expect(templateSourceJob(t.id), t.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("never exposes source job ids through the catalog", () => {
    expect(JSON.stringify(listTemplates())).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});
