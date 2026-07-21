// Detects LinkedIn's native Save (social bar or ⋯ overflow menu) and captures the post.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const MENU_HOOK_FLAG = "data-lis-menu-hook";
  const CONTEXT_TTL_MS = 20000;
  const CONTEXT_QUALITY = {
    proximity: 1,
    direct: 2,
    "menu-owner": 3,
    trigger: 4,
  };
  const recentContext = { postEl: null, at: 0, source: "proximity" };
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
    ".feed-shared-control-menu__trigger, button.feed-shared-control-menu__trigger, button.artdeco-dropdown__trigger, button[aria-label*='control menu' i], button[aria-label*='Open control menu' i], button[aria-label*='more actions' i]";

  function hasFreshContext(now = Date.now()) {
    return Boolean(
      recentContext.postEl?.isConnected &&
        now - recentContext.at < CONTEXT_TTL_MS
    );
  }

  function isReliable(postEl) {
    return Boolean(postEl && LIS.isReliablePostCandidate?.(postEl));
  }

  function clearRememberedContext() {
    recentContext.postEl = null;
    recentContext.at = 0;
    recentContext.source = "proximity";
  }

  function rememberPost(postEl, source = "direct") {
    if (!postEl?.isConnected) {
      if (source === "trigger") clearRememberedContext();
      return false;
    }
    const now = Date.now();
    if (
      hasFreshContext(now) &&
      CONTEXT_QUALITY[source] < CONTEXT_QUALITY[recentContext.source]
    ) {
      return false;
    }
    recentContext.postEl = postEl;
    recentContext.at = now;
    recentContext.source = source;
    return true;
  }

  function rememberPostContext(target, source = "direct") {
    rememberPost(LIS.findPostFrom(target), source);
  }

  function rememberPostAtPoint(x, y) {
    rememberPost(LIS.findPostNearPoint?.(x, y), "proximity");
  }

  function freshRememberedPost() {
    if (!hasFreshContext()) return null;
    if (recentContext.source === "trigger") return recentContext.postEl;
    return isReliable(recentContext.postEl) ? recentContext.postEl : null;
  }

  function resolvePostFromContext(target) {
    const direct = LIS.findPostFrom(target);
    if (isReliable(direct)) return direct;
    return freshRememberedPost();
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** Menu is portaled outside the post — find the ⋯ trigger that opened it. */
  function resolvePostFromOpenMenu() {
    const activePost = LIS.findPostFrom(document.activeElement);
    if (activePost) return activePost;

    for (const trigger of document.querySelectorAll(
      `${OVERFLOW_TRIGGER}, button.artdeco-dropdown__trigger`
    )) {
      if (trigger.getAttribute("aria-expanded") !== "true") continue;
      const post = LIS.findPostFrom(trigger);
      if (post) return post;
    }

    for (const menu of document.querySelectorAll(
      "[role='menu'], .artdeco-dropdown__content"
    )) {
      if (!isVisible(menu)) continue;
      const id = menu.id;
      if (!id) continue;
      const trigger = document.querySelector(`[aria-controls="${CSS.escape(id)}"]`);
      const post = LIS.findPostFrom(trigger);
      if (post) return post;
    }

    const openMenu = [...document.querySelectorAll(MENU_ROOT)].find(isVisible);
    if (openMenu) {
      const mr = openMenu.getBoundingClientRect();
      let nearest = null;
      let best = Infinity;
      for (const post of LIS.findPosts()) {
        const pr = post.getBoundingClientRect();
        const dy = Math.abs((pr.top + pr.bottom) / 2 - (mr.top + mr.bottom) / 2);
        const dx =
          pr.right < mr.left
            ? mr.left - pr.right
            : mr.right < pr.left
              ? pr.left - mr.right
              : 0;
        const score = dy * dy + dx * dx;
        if (score < best) {
          best = score;
          nearest = post;
        }
      }
      if (nearest && best < 800_000) return nearest;
      const fallback = LIS.findBestPostCandidate?.(openMenu);
      if (fallback) return fallback;
    }

    return null;
  }

  function resolvePostForSave(target) {
    const direct = LIS.findPostFrom(target);
    if (isReliable(direct)) return direct;

    const menuOwner = resolvePostFromOpenMenu();
    if (isReliable(menuOwner)) {
      rememberPost(menuOwner, "menu-owner");
      return menuOwner;
    }

    const remembered = freshRememberedPost();
    if (remembered) return remembered;

    const fallback = LIS.findBestPostCandidate?.(getActionElement(target));
    return isReliable(fallback) ? fallback : null;
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
    return /\bsaved\b|unsave|remove\s+bookmark|unbookmark|удал|збережено/i.test(text);
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
    const triggers = postEl.querySelectorAll(
      `${OVERFLOW_TRIGGER}, button.artdeco-dropdown__trigger`
    );
    for (const trigger of triggers) {
      if (trigger.hasAttribute(MENU_HOOK_FLAG)) continue;
      trigger.setAttribute(MENU_HOOK_FLAG, "1");
      trigger.addEventListener(
        "click",
        () => rememberPost(LIS.findPostFrom(trigger), "trigger"),
        true
      );
    }
  }

  // postEl -> { btn, observer } for the Save button we're currently watching.
  // Keyed weakly so detached posts (feed recycling) drop out on GC.
  const observedPosts = new WeakMap();

  function attachSaveObserver(postEl) {
    // Fast path: already watching a live button on this post. Avoids re-scanning
    // on every feed mutation once a post is hooked.
    const existing = observedPosts.get(postEl);
    if (existing && existing.btn.isConnected) return;

    // The social bar (and its Save button) is lazy-rendered, so a freshly
    // injected feed post often has no button yet on the first pass. Don't flag
    // the post as done — keep retrying on later mutations until it appears.
    const btn = LIS.findSaveButton(postEl);
    if (!btn) return;

    // The button we were watching was replaced by an in-place re-render
    // (auto-refreshing feed). Drop the stale observer before rebinding.
    if (existing) existing.observer.disconnect();

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
    observedPosts.set(postEl, { btn, observer });
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

    const postEl = resolvePostForSave(target);
    if (!postEl) {
      LIS.showToast(
        "LinkedIn Saver: couldn't find the post — try ⋯ → Save again",
        "error"
      );
      return;
    }
    rememberPost(
      postEl,
      isInDropdown(getActionElement(target)) ? "menu-owner" : "direct"
    );

    LIS.showToast("LinkedIn Saver: capturing saved post…", "info");
    LIS.capturePost(postEl).then((resp) => {
      if (resp?.ok) LIS.showToast("LinkedIn Saver: captured ✓", "info");
    });
  }

  LIS.onNativeSaveClick = function onNativeSaveClick(event) {
    const action = getActionElement(event.target);
    const trigger = event.target?.closest?.(OVERFLOW_TRIGGER);
    if (trigger) {
      rememberPostContext(trigger, "trigger");
    } else if (!isInDropdown(action)) {
      rememberPostContext(event.target, "direct");
      rememberPostAtPoint(event.clientX, event.clientY);
    }

    handleSaveClick(event.target);
  };

  // Viewer identity is cached across pages so obfuscated / non-feed surfaces —
  // where the live nav can't name the viewer — still refuse to save the viewer
  // as the post author. Persist every fresh read, and seed from storage on load
  // (fills only what the live nav hasn't already resolved this session).
  LIS.onViewerIdentityResolved = (identity) => {
    LIS.safeStorageSet?.({ viewerIdentity: identity });
  };
  LIS.safeStorageGet?.(["viewerIdentity"], ({ viewerIdentity }) => {
    if (viewerIdentity) LIS.primeViewerIdentity?.(viewerIdentity);
  });

  document.addEventListener("click", LIS.onNativeSaveClick, true);
  document.addEventListener(
    "mouseover",
    (e) => {
      rememberPostContext(e.target, "direct");
      rememberPostAtPoint(e.clientX, e.clientY);
    },
    true
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      const trigger = e.target?.closest?.(
        `${OVERFLOW_TRIGGER}, button.artdeco-dropdown__trigger`
      );
      if (trigger) {
        rememberPost(LIS.findPostFrom(trigger), "trigger");
        return;
      }
      rememberPostContext(e.target, "direct");
      rememberPostAtPoint(e.clientX, e.clientY);
    },
    true
  );
})();
