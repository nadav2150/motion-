import { describe, expect, it } from "vitest";
import { restartDecision, WEB_POLICY, WORKER_POLICY } from "./supervisor";

describe("restartDecision", () => {
  const now = 1_000_000;
  it("backs off exponentially", () => {
    expect(restartDecision([now], now, WEB_POLICY)).toMatchObject({ action: "restart", delayMs: 1000 });
    expect(restartDecision([now - 3000, now], now, WEB_POLICY)).toMatchObject({ action: "restart", delayMs: 2000 });
    expect(restartDecision([now - 9000, now - 3000, now], now, WEB_POLICY)).toMatchObject({ action: "restart", delayMs: 4000 });
  });
  it("gives up on a web server that keeps crashing, forgets old crashes", () => {
    const five = [0, 1, 2, 3, 4].map((i) => now - i * 10_000);
    expect(restartDecision(five, now, WEB_POLICY).action).toBe("give_up");
    const spread = [now - 20 * 60_000, now - 15 * 60_000, now - 10 * 60_000, now - 6 * 60_000, now];
    expect(restartDecision(spread, now, WEB_POLICY)).toMatchObject({ action: "restart", recent: 1 });
  });
  it("always restarts the worker, capped at 60 s", () => {
    const many = Array.from({ length: 20 }, (_, i) => now - i * 1000);
    expect(restartDecision(many, now, WORKER_POLICY)).toEqual({ action: "restart", delayMs: 60_000, recent: 20 });
  });
});
