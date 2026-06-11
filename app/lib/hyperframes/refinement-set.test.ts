import { describe, expect, it } from "vitest";
import { buildRefinementSet, type SceneCritique } from "./llm-director";

function shipCritique(sceneId: string): SceneCritique {
  return {
    sceneId,
    scores: {
      composition: 80,
      typographyHierarchy: 80,
      colorTension: 80,
      focalClarity: 80,
      motionClarity: 80,
      brandFidelity: 80,
      restraintQuality: 80,
      creativeDistinctiveness: 80,
      overall: 80,
    },
    verdict: "ship",
    issues: [],
  };
}

describe("buildRefinementSet — telemetry merge", () => {
  it("forces a shipped scene into refinement when telemetry gates fire", () => {
    const telemetry = new Map<string, string[]>([
      ["s2", ["element h2#pop@0 pops in at ~2.0s with no transition — fade or scale it in over ≥250ms"]],
    ]);
    const set = buildRefinementSet(
      [shipCritique("s1"), shipCritique("s2")],
      null,
      telemetry,
    );
    expect(set).toHaveLength(1);
    expect(set[0].sceneId).toBe("s2");
    expect(set[0].feedbackText).toContain("MEASURED MOTION ISSUES");
    expect(set[0].feedbackText).toContain("pops in at ~2.0s");
  });

  it("appends telemetry issues to a scene already flagged by critique", () => {
    const critique = shipCritique("s1");
    critique.verdict = "refine";
    critique.issues = [
      {
        severity: "major",
        dimension: "motionClarity",
        description: "entrance is chaotic",
        suggestedFix: "stagger the three headline words 80ms apart",
      },
    ];
    const telemetry = new Map<string, string[]>([
      ["s1", ["scene ends mid-motion (h1#a@0, p#b@1, div#c@2 still moving in the final 10%) — pull animations forward so the final frame settles"]],
    ]);
    const set = buildRefinementSet([critique], null, telemetry);
    expect(set).toHaveLength(1);
    expect(set[0].feedbackText).toContain("PER-SCENE ISSUES");
    expect(set[0].feedbackText).toContain("MEASURED MOTION ISSUES");
  });

  it("behaves exactly as before when no telemetry map is given", () => {
    const set = buildRefinementSet([shipCritique("s1")], null);
    expect(set).toEqual([]);
  });
});
