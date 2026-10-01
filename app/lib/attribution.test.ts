import { describe, expect, it } from "vitest";
import { ATTRIBUTION_COOKIE, readAttribution, sanitizeAttribution } from "./attribution";

function req(cookie: string): Request {
  return new Request("https://videly.io/register", { headers: { Cookie: cookie } });
}

describe("attribution", () => {
  it("reads the cookie among others", () => {
    const value = encodeURIComponent(JSON.stringify({ utm_source: "google", ref: "nadav" }));
    expect(readAttribution(req(`a=1; ${ATTRIBUTION_COOKIE}=${value}; b=2`))).toEqual({
      utm_source: "google",
      ref: "nadav",
    });
  });

  it("returns null when missing or malformed", () => {
    expect(readAttribution(req("a=1"))).toBeNull();
    expect(readAttribution(req(`${ATTRIBUTION_COOKIE}=%7Bnot-json`))).toBeNull();
  });

  it("drops unknown keys and non-strings, caps length", () => {
    const out = sanitizeAttribution({ utm_source: "x".repeat(500), evil: "1", ref: 42, utm_medium: "  " });
    expect(out).toEqual({ utm_source: "x".repeat(200) });
    expect(sanitizeAttribution({ evil: "1" })).toBeNull();
  });
});
