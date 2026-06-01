// Detects LinkedIn's native Save control on feed posts and triggers capture.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const HOOK_FLAG = "data-lis-native-hook";
  const SOCIAL_BAR =
    ".feed-shared-social-action-bar, .social-details-social-actions, .feed-shared-social-action-bar__action-button";

  function isSocialActionButton(el) {
    return !!el?.closest?.(SOCIAL_BAR);
  }

  function getAriaLabel(el) {
    if (!el) return "";
    const btn = el.closest?.("button") || (el.tagName === "BUTTON" ? el : null);
    return btn?.getAttribute("aria-label") || btn?.getAttribute("aria-labelledby") || "";
  }

  LIS.isNativeSaveClick = function isNativeSaveClick(target) {
    const btn = target?.closest?.("button");
    if (!btn || btn.classList?.contains("lis-save-btn")) return false;
    if (!isSocialActionButton(btn)) return false;
    const label = btn.getAttribute("aria-label") || "";
    if (/^save\b/i.test(label) || /^save\s+post/i.test(label)) return true;
    if (label.toLowerCase().includes("save") && !/unsave|remove/i.test(label)) {
      return true;
    }
    return false;
  };

  function isSavedState(btn) {
    if (!btn) return false;
    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (/unsave|saved|remove\s+bookmark/.test(label)) return true;
    if (btn.getAttribute("aria-pressed") === "true") return true;
    return false;
  }

  LIS.findSaveButton = function findSaveButton(postEl) {
    const bar = postEl.querySelector(SOCIAL_BAR.split(",")[0].trim());
    const root = bar || postEl;
    const buttons = root.querySelectorAll("button[aria-label]");
    for (const btn of buttons) {
      const label = btn.getAttribute("aria-label") || "";
      if (/^save\b/i.test(label) || /^save\s+post/i.test(label)) return btn;
      if (/unsave|saved/i.test(label)) return btn;
    }
    return null;
  };

  function attachSaveObserver(postEl) {
    if (postEl.hasAttribute(HOOK_FLAG)) return;
    postEl.setAttribute(HOOK_FLAG, "1");

    const btn = LIS.findSaveButton(postEl);
    if (!btn) return;

    let wasSaved = isSavedState(btn);

    const observer = new MutationObserver(() => {
      const nowSaved = isSavedState(btn);
      if (!wasSaved && nowSaved) {
        LIS.capturePost(postEl);
      }
      wasSaved = nowSaved;
    });

    observer.observe(btn, {
      attributes: true,
      attributeFilter: ["aria-label", "aria-pressed", "class"],
    });
  }

  LIS.hookPost = function hookPost(postEl) {
    attachSaveObserver(postEl);
  };

  LIS.hookAllPosts = function hookAllPosts() {
    for (const postEl of LIS.findPosts()) {
      LIS.hookPost(postEl);
    }
  };

  LIS.onNativeSaveClick = function onNativeSaveClick(event) {
    if (!LIS.isNativeSaveClick(event.target)) return;
    const postEl = LIS.findPostFrom(event.target);
    if (postEl) LIS.capturePost(postEl);
  };

  document.addEventListener("click", LIS.onNativeSaveClick, true);
})();
