import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadSaveModule({ response }) {
  globalThis.LIS = { contextAlive: () => true };
  globalThis.chrome = {
    runtime: {
      id: "test-extension",
      lastError: undefined,
      sendMessage: (_msg, cb) => cb(response),
    },
  };
  vi.resetModules();
  await import("../extension/lib/save.js");
  globalThis.LIS.showToast = vi.fn();
  return globalThis.LIS;
}

beforeEach(() => {
  delete globalThis.chrome;
});

describe("capturePayload silent option", () => {
  it("shows an error toast on failure by default", async () => {
    const LIS = await loadSaveModule({ response: { ok: false, error: "server 500" } });
    const result = await LIS.capturePayload({ text: "post" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("server error");
    expect(LIS.showToast).toHaveBeenCalledWith("LinkedIn Saver: server error", "error");
  });

  it("suppresses the toast when silent is set, but still returns the error", async () => {
    const LIS = await loadSaveModule({ response: { ok: false, error: "server 500" } });
    const result = await LIS.capturePayload({ text: "post" }, { silent: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("server error");
    expect(LIS.showToast).not.toHaveBeenCalled();
  });

  it("passes createOnly through alongside silent", async () => {
    let sent = null;
    globalThis.LIS = { contextAlive: () => true };
    globalThis.chrome = {
      runtime: {
        id: "test-extension",
        lastError: undefined,
        sendMessage: (msg, cb) => {
          sent = msg;
          cb({ ok: true, post: { id: 1 } });
        },
      },
    };
    vi.resetModules();
    await import("../extension/lib/save.js");
    globalThis.LIS.showToast = vi.fn();
    const result = await globalThis.LIS.capturePayload(
      { text: "post" },
      { createOnly: true, silent: true }
    );
    expect(result.ok).toBe(true);
    expect(sent.payload.createOnly).toBe(true);
    expect(sent.payload.silent).toBeUndefined();
  });
});
