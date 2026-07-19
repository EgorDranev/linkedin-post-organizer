import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(async () => {
  globalThis.LIS = {};
  // Re-execute the IIFE each test (Vite forbids variable dynamic-import paths,
  // so a cache-busting query string is not an option here).
  vi.resetModules();
  await import("../extension/import-saved.js");
});

describe("saved-posts page detection", () => {
  it("matches the saved-posts path with and without trailing slash", () => {
    expect(globalThis.LIS.isSavedPostsPath("/my-items/saved-posts/")).toBe(true);
    expect(globalThis.LIS.isSavedPostsPath("/my-items/saved-posts")).toBe(true);
  });

  it("rejects other LinkedIn paths", () => {
    expect(globalThis.LIS.isSavedPostsPath("/feed/")).toBe(false);
    expect(globalThis.LIS.isSavedPostsPath("/my-items/")).toBe(false);
    expect(globalThis.LIS.isSavedPostsPath("/my-items/saved-jobs/")).toBe(false);
    expect(globalThis.LIS.isSavedPostsPath("")).toBe(false);
    expect(globalThis.LIS.isSavedPostsPath(undefined)).toBe(false);
  });
});

describe("run-fatal error classification", () => {
  it("treats auth and unreachable errors as run-fatal", () => {
    expect(
      globalThis.LIS.isRunFatalError("reconnect the extension (click its toolbar icon)")
    ).toBe(true);
    expect(globalThis.LIS.isRunFatalError("server not reachable")).toBe(true);
  });

  it("treats per-post errors as card-local", () => {
    expect(globalThis.LIS.isRunFatalError("server error")).toBe(false);
    expect(globalThis.LIS.isRunFatalError("server rejected the save")).toBe(false);
    expect(globalThis.LIS.isRunFatalError("")).toBe(false);
    expect(globalThis.LIS.isRunFatalError(undefined)).toBe(false);
  });
});
