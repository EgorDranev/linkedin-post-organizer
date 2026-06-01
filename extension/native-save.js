// Detects LinkedIn's native Save (social bar or ⋯ overflow menu) and captures the post.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const HOOK_FLAG = "data-lis-native-hook";
  const MENU_HOOK_FLAG = "data-lis-menu-hook";
  const CONTEXT_TTL_MS = 20000;
  const recentContext = { postEl: null, at: 0 };
  const SOCIAL_BAR =
    ".feed-shared-social-action-bar, .social-details-social-actions";

  const MENU_ROOT =
    "[role='menu'], .artdeco-dropdown__content, .artdeco-dropdown__content-inner";

  const ACTION_SELECTOR = [
    "button",
    "[role='menuitem']",
    ".artdeco-dropdown__item",
    "[role='button']",
    "a[role='button']",
  ].join(", ");

  const OVERFLOW_TRIGGER =
    ".feed-shared-control-menu__trigger, button.feed-shared-control-menu__trigger, button[aria-label*='control menu' i], button[aria-label*='Open control menu' i]";

  function rememberPost(postEl) {
    if (!postEl) return;
    recentContext.postEl = postEl;
    recentContext.at = Date.now();
  }

  function rememberPostContext(target) {
    rememberPost(LIS.findPostFrom(target));
  }

  function resolvePostFromContext(target) {
    const direct = LIS.findPostFrom(target);
    if (direct) return direct;
    const fresh = Date.now() - recentContext.at < CONTEXT_TTL_MS;
    return fresh ? recentContext.postEl : null;
  }

  function getActionElement(target) {
    return target?.closest?.(ACTION_SELECTOR);
  }

  function isInDropdown(el) {
    return !!el?.closest?.(MENU_ROOT);
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
    return /\bsave\b|bookmark|сохран|збереж|merken|guardar|salvar/i.test(text);
  }

  function isUnsaveIntentText(text) {
    return /unsave|remove\s+bookmark|unbookmark|удал|збережено/i.test(text);
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

    const useEls = el.querySelectorAll("svg use");
    for (const useEl of useEls) {
      const ref = (
        useEl.getAttribute("href") ||
        useEl.getAttribute("xlink:href") ||
        ""
      ).toLowerCase();
      if (ref.includes("bookmark") || ref.includes("save")) return true;
    }
    if (el.querySelector('svg[aria-label*="bookmark" i], svg[aria-label*="save" i]')) {
      return true;
    }

    return false;
  }

  function isSaveAction(target) {
    const el = getActionElement(target);
    if (!el || el.classList?.contains("lis-save-btn")) return null;
    const text = getActionText(el);
    if (isUnsaveIntentText(text)) return null;
    if (!hasSaveSemantics(el) && !isSaveIntentText(text)) return null;
    return el;
  }

  LIS.isNativeSaveClick = function isNativeSaveClick(target) {
    const el = isSaveAction(target);
    if (!el) return false;
    if (isInDropdown(el)) return true;
    return !!resolvePostFromContext(target);
  };

  function isSavedState(btn) {
    if (!btn) return false;
    const text = getActionText(btn);
    if (isUnsaveIntentText(text)) return true;
    if (btn.getAttribute("aria-pressed") === "true") return true;
    return false;
  }

  LIS.findSaveButton = function findSaveButton(postEl) {
    const bar = postEl.querySelector(SOCIAL_BAR);
    const root = bar || postEl;
    for (const btn of root.querySelectorAll("button")) {
      if (hasSaveSemantics(btn) || isSavedState(btn)) return btn;
    }
    return null;
  };

  function attachOverflowTriggerHook(postEl) {
    const triggers = postEl.querySelectorAll(OVERFLOW_TRIGGER);
    for (const trigger of triggers) {
      if (trigger.hasAttribute(MENU_HOOK_FLAG)) continue;
      trigger.setAttribute(MENU_HOOK_FLAG, "1");
      trigger.addEventListener(
        "click",
        () => rememberPost(postEl),
        true
      );
    }
  }

  function attachSaveObserver(postEl) {
    if (postEl.hasAttribute(HOOK_FLAG)) return;
    postEl.setAttribute(HOOK_FLAG, "1");

    const btn = LIS.findSaveButton(postEl);
    if (!btn) return;

    let wasSaved = isSavedState(btn);
    const observer = new MutationObserver(() => {
      const nowSaved = isSavedState(btn);
      if (!wasSaved && nowSaved) LIS.capturePost(postEl);
      wasSaved = nowSaved;
    });

    observer.observe(btn, {
      attributes: true,
      attributeFilter: ["aria-label", "aria-pressed", "class"],
    });
  }

  LIS.hookPost = function hookPost(postEl) {
    attachOverflowTriggerHook(postEl);
    attachSaveObserver(postEl);
  };

  LIS.hookAllPosts = function hookAllPosts() {
    for (const postEl of LIS.findPosts()) LIS.hookPost(postEl);
  };

  function handleSaveClick(target) {
    if (!LIS.isNativeSaveClick(target)) return;

    const postEl = resolvePostFromContext(target);
    if (!postEl) {
      LIS.showToast(
        "LinkedIn Saver: open ⋯ on the post, then tap Save again",
        "error"
      );
      return;
    }

    LIS.showToast("LinkedIn Saver: capturing saved post…", "info");
    LIS.capturePost(postEl).then((resp) => {
      if (resp?.ok) LIS.showToast("LinkedIn Saver: captured ✓", "info");
    });
  }

  LIS.onNativeSaveClick = function onNativeSaveClick(event) {
    const trigger = event.target?.closest?.(OVERFLOW_TRIGGER);
    if (trigger) rememberPostContext(trigger);
    else rememberPostContext(event.target);

    handleSaveClick(event.target);
  };

  document.addEventListener("click", LIS.onNativeSaveClick, true);
  document.addEventListener(
    "pointerdown",
    (e) => {
      const trigger = e.target?.closest?.(OVERFLOW_TRIGGER);
      if (trigger) rememberPostContext(trigger);
    },
    true
  );
})();
