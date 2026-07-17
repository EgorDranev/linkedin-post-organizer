import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(async () => {
  globalThis.LIS = {};
  // Re-execute the IIFE each test (Vite forbids variable dynamic-import paths,
  // so a cache-busting query string is not an option here).
  vi.resetModules();
  await import("../extension/lib/pairing-core.js");
});

describe("extension pairing helpers", () => {
  it("creates a verifier with enough entropy", () => {
    const verifier = globalThis.LIS.createPairingVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("recognizes an active stored connection", () => {
    expect(globalThis.LIS.connectionState({ extensionToken: "lis_ext_x" })).toBe("connected");
    expect(globalThis.LIS.connectionState({})).toBe("disconnected");
  });
});
