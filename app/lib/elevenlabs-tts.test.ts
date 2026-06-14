import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsError, generateVoiceover } from "./elevenlabs-tts";

// Minimal Response-like stub for the fetch mock.
function makeRes(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => new TextEncoder().encode("audio-bytes").buffer,
    json: async () => body ?? {},
  } as unknown as Response;
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ELEVENLABS_API_KEY: "test-key" };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

describe("generateVoiceover — retry on concurrency 429", () => {
  it("retries a 429 and succeeds on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeRes(429, { detail: { status: "too_many_concurrent_requests" } }))
      .mockResolvedValueOnce(makeRes(429, { detail: { status: "too_many_concurrent_requests" } }))
      .mockResolvedValueOnce(makeRes(200));
    vi.stubGlobal("fetch", fetchMock);

    const buf = await generateVoiceover(
      { text: "hello", voiceId: "v1" },
      { baseDelayMs: 1 },
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws ElevenLabsError(429) after exhausting attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeRes(429, { detail: { status: "too_many_concurrent_requests" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateVoiceover({ text: "hi", voiceId: "v1" }, { maxAttempts: 3, baseDelayMs: 1 }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries on 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeRes(503))
      .mockResolvedValueOnce(makeRes(200));
    vi.stubGlobal("fetch", fetchMock);

    await generateVoiceover({ text: "hi", voiceId: "v1" }, { baseDelayMs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 401 (auth/quota) — fails fast", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeRes(401, { detail: "quota" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateVoiceover({ text: "hi", voiceId: "v1" }, { maxAttempts: 4, baseDelayMs: 1 }),
    ).rejects.toBeInstanceOf(ElevenLabsError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 422 (bad input) — fails fast", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeRes(422, { detail: "invalid" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateVoiceover({ text: "hi", voiceId: "v1" }, { maxAttempts: 4, baseDelayMs: 1 }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
