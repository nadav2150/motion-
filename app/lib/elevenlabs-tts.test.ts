import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsError, generateVoiceover, generateVoiceoverWithTimestamps } from "./elevenlabs-tts";

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

describe("generateVoiceoverWithTimestamps", () => {
  it("calls /with-timestamps and decodes audio + alignment", async () => {
    const alignment = {
      characters: ["H", "i"],
      character_start_times_seconds: [0, 0.1],
      character_end_times_seconds: [0.1, 0.2],
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeRes(200, { audio_base64: Buffer.from("mp3").toString("base64"), alignment, normalized_alignment: null }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateVoiceoverWithTimestamps({ text: "Hi", voiceId: "v1" });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/v1/text-to-speech/v1/with-timestamps?output_format=mp3_44100_128");
    expect(r.audio.toString()).toBe("mp3");
    expect(r.alignment).toEqual(alignment);
  });
});
