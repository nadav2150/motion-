import { describe, expect, it } from "vitest";
import { describeUploadError, isTransientUploadError } from "./storage";

describe("upload error handling", () => {
  it("retries dropped connections, empty errors, 5xx and 429", () => {
    expect(isTransientUploadError({ message: "<none>" })).toBe(true);
    expect(isTransientUploadError({ message: "fetch failed", name: "NetworkError" })).toBe(true);
    expect(isTransientUploadError({ message: "Bad gateway", statusCode: "502" })).toBe(true);
    expect(isTransientUploadError({ message: "slow down", status: 429 })).toBe(true);
  });

  it("does not retry configuration or size problems", () => {
    expect(isTransientUploadError({ message: "Bucket not found", statusCode: "404" })).toBe(false);
    expect(isTransientUploadError({ message: "new row violates row-level security policy", statusCode: "403" })).toBe(false);
    expect(isTransientUploadError({ message: "The object exceeded the maximum allowed size", statusCode: "413" })).toBe(false);
  });

  it("never reports an empty '<none>' message", () => {
    expect(describeUploadError({ message: "<none>", name: "StorageUnknownError", status: 500 })).toBe("StorageUnknownError · HTTP 500 · no error message");
  });
});
