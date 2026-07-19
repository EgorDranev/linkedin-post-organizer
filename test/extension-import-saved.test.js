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

function makeDeps(overrides = {}) {
  return {
    collect: () => [],
    extract: (item) => ({ url: item.url, text: "t" }),
    capture: vi.fn(async () => ({ ok: true, post: {} })),
    loadMore: vi.fn(async () => {}),
    delay: async () => {},
    shouldStop: () => false,
    onProgress: vi.fn(),
    ...overrides,
  };
}

describe("runSavedImport", () => {
  it("imports new cards, counts server duplicates, and ends after two empty rounds", async () => {
    const capture = vi.fn(async (payload) =>
      payload.url === "https://x/b"
        ? { ok: true, post: { duplicate: true } }
        : { ok: true, post: {} }
    );
    const deps = makeDeps({
      // Same two cards every round: round 1 processes both, rounds 2 and 3
      // find nothing new → terminate.
      collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
      capture,
    });
    const state = await globalThis.LIS.runSavedImport(deps);
    expect(state).toMatchObject({ imported: 1, duplicates: 1, failed: 0 });
    expect(capture).toHaveBeenCalledTimes(2);
    // loadMore runs after the processing round and after each empty round.
    expect(deps.loadMore).toHaveBeenCalledTimes(3);
  });

  it("stops the whole run on a fatal error without touching later cards", async () => {
    const capture = vi.fn(async () => ({
      ok: false,
      error: "reconnect the extension (click its toolbar icon)",
    }));
    const state = await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        capture,
      })
    );
    expect(capture).toHaveBeenCalledTimes(1);
    expect(state.fatalError).toMatch(/reconnect the extension/);
    expect(state.imported).toBe(0);
  });

  it("counts a card-local save failure and continues", async () => {
    const capture = vi.fn(async (payload) =>
      payload.url === "https://x/a"
        ? { ok: false, error: "server error" }
        : { ok: true, post: {} }
    );
    const state = await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        capture,
      })
    );
    expect(state).toMatchObject({ imported: 1, failed: 1, fatalError: "" });
  });

  it("counts a card that fails to extract and skips its capture", async () => {
    const capture = vi.fn(async () => ({ ok: true, post: {} }));
    const state = await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        extract: (item) => {
          if (item.url === "https://x/a") throw new Error("bad card");
          return { url: item.url, text: "t" };
        },
        capture,
      })
    );
    expect(capture).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ imported: 1, failed: 1 });
  });

  it("honors shouldStop between cards", async () => {
    let calls = 0;
    const state = await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        shouldStop: () => calls > 0,
        capture: vi.fn(async () => {
          calls += 1;
          return { ok: true, post: {} };
        }),
      })
    );
    expect(state.stopped).toBe(true);
    expect(state.imported).toBe(1);
  });

  it("reports progress after every card", async () => {
    const onProgress = vi.fn();
    await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        onProgress,
      })
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[1][0]).toMatchObject({ imported: 2 });
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

describe("import banner", () => {
  it("renders the idle state with a working Start button", () => {
    const onStart = vi.fn();
    const el = globalThis.LIS.renderImportBanner({ mode: "idle", onStart });
    expect(el.textContent).toMatch(/Import these saved posts/);
    el.querySelector("button").click();
    expect(onStart).toHaveBeenCalled();
  });

  it("renders running counters and a Stop button", () => {
    const onStop = vi.fn();
    const el = globalThis.LIS.renderImportBanner({
      mode: "running",
      state: { imported: 3, duplicates: 2, failed: 1 },
      onStop,
    });
    expect(el.textContent).toMatch(/Imported 3 · Already saved 2 · Failed 1/);
    el.querySelector("button").click();
    expect(onStop).toHaveBeenCalled();
  });

  it("renders a done summary and a fatal-error summary", () => {
    const done = globalThis.LIS.renderImportBanner({
      mode: "done",
      state: { imported: 5, duplicates: 0, failed: 0, stopped: false, fatalError: "" },
    });
    expect(done.textContent).toMatch(/Import finished\. Imported 5/);
    expect(done.querySelector("button")).toBeNull();

    const failed = globalThis.LIS.renderImportBanner({
      mode: "done",
      state: {
        imported: 2,
        duplicates: 0,
        failed: 0,
        stopped: false,
        fatalError: "server not reachable",
      },
    });
    expect(failed.textContent).toMatch(/Import stopped: server not reachable/);
  });

  it("renders the disconnected state without a button and reuses one element", () => {
    const el = globalThis.LIS.renderImportBanner({ mode: "disconnected" });
    expect(el.textContent).toMatch(/connect the extension/i);
    expect(el.querySelector("button")).toBeNull();
    const again = globalThis.LIS.renderImportBanner({ mode: "disconnected" });
    expect(again).toBe(el);
    expect(document.querySelectorAll("#lis-import-banner")).toHaveLength(1);
  });
});
