import { afterEach, describe, expect, it, vi } from "vitest";

async function loadNativeSave() {
  const capturePost = vi.fn(async () => ({ ok: true }));
  const showToast = vi.fn();
  globalThis.LIS = {
    capturePost,
    showToast,
    safeStorageGet: (_keys, callback) => callback({}),
    safeStorageSet: vi.fn(),
    primeViewerIdentity: vi.fn(),
    findPosts: () => [],
    findBestPostCandidate: vi.fn(() => null),
    findPostFrom: vi.fn(() => null),
    findPostNearPoint: vi.fn(() => null),
    isReliablePostCandidate: (el) => el?.dataset?.reliable === "true",
  };
  vi.resetModules();
  await import("../extension/native-save.js");
  return { LIS: globalThis.LIS, capturePost, showToast };
}

afterEach(() => {
  document.body.innerHTML = "";
  delete globalThis.LIS;
});

describe("native Save context", () => {
  it("keeps trigger-bound post context when the portaled Save menu sits over an overlay", async () => {
    const { LIS, capturePost } = await loadNativeSave();
    document.body.innerHTML = `
      <article id="post" data-reliable="true">
        <button id="trigger" aria-label="Open control menu" aria-expanded="true">More</button>
        <strong>Suprava Sabat</strong>
        <p>Connect CLAUDE to LinkedIn in one click. One MCP.</p>
      </article>
      <div id="overlay">
        <strong>Egor Dranev</strong>
        <p>Image in comment shared by Suprava Sabat</p>
      </div>
      <div role="menu"><button id="save" role="menuitem">Save</button></div>`;

    const post = document.getElementById("post");
    const overlay = document.getElementById("overlay");
    const trigger = document.getElementById("trigger");
    const save = document.getElementById("save");
    LIS.findPostFrom.mockImplementation((el) => (post.contains(el) ? post : null));
    LIS.findPostNearPoint.mockImplementation((x) => (x > 500 ? overlay : post));
    LIS.findPosts = () => [post];

    LIS.onNativeSaveClick({ target: trigger, clientX: 100, clientY: 20 });
    LIS.onNativeSaveClick({ target: save, clientX: 900, clientY: 20 });

    expect(capturePost).toHaveBeenCalledTimes(1);
    expect(capturePost).toHaveBeenCalledWith(post);
  });

  it("refuses an overlay-only candidate", async () => {
    const { LIS, capturePost, showToast } = await loadNativeSave();
    document.body.innerHTML = `
      <div id="overlay">
        <strong>Egor Dranev</strong>
        <p>Image in comment shared by Suprava Sabat</p>
      </div>
      <div role="menu"><button id="save" role="menuitem">Save</button></div>`;

    const overlay = document.getElementById("overlay");
    const save = document.getElementById("save");
    LIS.findPostNearPoint.mockReturnValue(overlay);
    LIS.findBestPostCandidate.mockReturnValue(overlay);

    LIS.onNativeSaveClick({ target: save, clientX: 900, clientY: 20 });

    expect(capturePost).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "LinkedIn Saver: couldn't find the post — try ⋯ → Save again",
      "error"
    );
  });

  it("keeps proximity fallback when no stronger context exists", async () => {
    const { LIS, capturePost } = await loadNativeSave();
    document.body.innerHTML = `
      <article id="post" data-reliable="true"><p>A reliable nearby post body.</p></article>
      <button id="save" role="button">Save</button>`;

    const post = document.getElementById("post");
    const save = document.getElementById("save");
    LIS.findPostNearPoint.mockReturnValue(post);

    LIS.onNativeSaveClick({ target: save, clientX: 100, clientY: 20 });

    expect(capturePost).toHaveBeenCalledWith(post);
  });
});
