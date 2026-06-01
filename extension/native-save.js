// Detects LinkedIn's native Save control on feed posts and triggers capture.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const HOOK_FLAG = "data-lis-native-hook";
  const CONTEXT_TTL_MS = 8000;
  const recentContext = { postEl: null, at: 0 };
  const SOCIAL_BAR =
    ".feed-shared-social-action-bar, .social-details-social-actions, .feed-shared-social-action-bar__action-button";

  function getActionElement(target) {
    return target?.closest?.(
      "button, [role='menuitem'], [role='button'], a[role='button']"
    );
  }

  function rememberPostContext(target) {
    const postEl = LIS.findPostFrom(target);
    if (!postEl) return;
    recentContext.postEl = postEl;
    recentContext.at = Date.now();
  }

  function resolvePostFromContext(target) {
    const direct = LIS.findPostFrom(target);
    if (direct) return direct;
    const fresh = Date.now() - recentContext.at < CONTEXT_TTL_MS;
    return fresh ? recentContext.postEl : null;
  }

  function getActionText(el) {
    if (!el) return "";
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => node.textContent || "");
      const combined = parts.join(" ").trim();
      if (combined) return combined.toLowerCase();
    }

    return (
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.textContent ||
      ""
    )
      .toLowerCase()
      .trim();
  }

  function isSaveIntentText(text) {
    // English + common localized strings.
    return /\bsave\b|bookmark|сохран|збереж|merken|guardar|salvar/i.test(text);
  }

  function isUnsaveIntentText(text) {
    return /unsave|saved|remove|unbookmark|удал|зберігається|saved to/i.test(text);
  }

  function hasSaveSemantics(el) {
    if (!el) return false;
    const text = getActionText(el);
    if (isSaveIntentText(text)) return true;

    const controlName = (
      el.getAttribute("data-control-name") ||
      el.getAttribute("data-tracking-control-name") ||
      ""
    ).toLowerCase();
    if (controlName.includes("save") || controlName.includes("bookmark")) {
      return true;
    }

    // Icon-only save buttons often expose these signals.
    const useEls = el.querySelectorAll("svg use");
    for (const useEl of useEls) {
      const ref = (useEl.getAttribute("href") || useEl.getAttribute("xlink:href") || "").toLowerCase();
      if (ref.includes("bookmark") || ref.includes("save")) return true;
    }
    if (el.querySelector('svg[aria-label*="bookmark" i], svg[aria-label*="save" i]')) {
      return true;
    }

    return false;
  }

  LIS.isNativeSaveClick = function isNativeSaveClick(target) {
    const el = getActionElement(target);
    if (!el || el.classList?.contains("lis-save-btn")) return false;
    const postEl = resolvePostFromContext(target);
    if (!postEl) return false;
    const text = getActionText(el);
    if (isUnsaveIntentText(text)) return false;
    return hasSaveSemantics(el);
  };

  function isSavedState(btn) {
    if (!btn) return false;
    const text = getActionText(btn);
    if (isUnsaveIntentText(text)) return true;
    if (btn.getAttribute("aria-pressed") === "true") return true;
    const active = (
      btn.getAttribute("data-state") ||
      btn.getAttribute("aria-current") ||
      ""
    ).toLowerCase();
    if (active === "true" || active === "active") return true;
    return false;
  }

  LIS.findSaveButton = function findSaveButton(postEl) {
    const bar = postEl.querySelector(SOCIAL_BAR.split(",")[0].trim());
    const root = bar || postEl;
    const buttons = root.querySelectorAll("button");
    for (const btn of buttons) {
      if (hasSaveSemantics(btn) || isSavedState(btn)) return btn;
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
    rememberPostContext(event.target);
    if (!LIS.isNativeSaveClick(event.target)) return;
    const postEl = resolvePostFromContext(event.target);
    if (!postEl) {
      LIS.showToast("LinkedIn Saver: found Save, but couldn't map it to a post", "error");
      return;
    }
    LIS.showToast("LinkedIn Saver: capturing saved post…", "info");
    LIS.capturePost(postEl).then((resp) => {
      if (resp?.ok) LIS.showToast("LinkedIn Saver: captured ✓", "info");
    });
  };

  document.addEventListener("click", LIS.onNativeSaveClick, true);
})();
