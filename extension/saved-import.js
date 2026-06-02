// Imports LinkedIn's saved-posts list by scrolling the page and creating only
// posts the app does not already have.
(function () {
  const LIS = globalThis.LIS;
  if (!LIS) return;

  const IDLE_ROUNDS = 4;
  const MAX_ROUNDS = 90;
  const SCROLL_DELAY_MS = 900;

  let activeImport = null;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getExistingUrls() {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "existing-post-urls" }, (resp) => {
          if (chrome.runtime.lastError || !resp?.ok) {
            reject(new Error(chrome.runtime.lastError?.message || resp?.error || ""));
            return;
          }
          resolve(new Set((resp.urls || []).map(LIS.canonicalPostUrl).filter(Boolean)));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function visibleSavedItems() {
    return LIS.findSavedPostItems().map((item) => ({
      ...item,
      url: LIS.canonicalPostUrl(item.url),
    }));
  }

  function hasExtractedText(payload) {
    return Boolean(
      payload?.text &&
        payload.text.trim() &&
        !/^\[LinkedIn post .+ no text extracted\]/i.test(payload.text.trim())
    );
  }

  function documentTextPenalty(text) {
    const value = String(text || "");
    let penalty = 0;
    if (/Table of Contents/i.test(value)) penalty += 4;
    if (/\bWHEREAS\b|\bNOW,\s*THEREFORE\b/i.test(value)) penalty += 3;
    if (/\bLast edited on\b/i.test(value)) penalty += 2;
    if (/\bThis document has been adapted\b/i.test(value)) penalty += 2;
    if (/\[[A-Z _-]{3,}\]/.test(value)) penalty += 2;
    if ((value.match(/\b\d{1,2}\s+[A-Z][A-Za-z][A-Za-z -]{5,}/g) || []).length > 8) {
      penalty += 2;
    }
    return penalty;
  }

  function commentaryScore(payload) {
    if (!hasExtractedText(payload)) return -100;
    const text = payload.text.trim();
    let score = 0;
    if (payload.author) score += 1;
    if (text.length >= 80) score += 2;
    if (text.length >= 180) score += 2;
    if (text.length > 5000) score -= 3;
    if (/\n/.test(text)) score += 1;
    if (/I\b|we\b|you\b|founder|startup|agreement|recommend/i.test(text)) score += 1;
    score -= documentTextPenalty(text) * 3;
    return score;
  }

  function scrapePostUrl(url) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "scrape-post-url", url }, (resp) => {
          if (chrome.runtime.lastError || !resp?.ok || !resp.payload) {
            resolve(null);
            return;
          }
          resolve(resp.payload);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function importVisibleNewItems(existing, seen, stats) {
    for (const item of visibleSavedItems()) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);

      const shallowPayload = LIS.extractSavedItem(item);
      const scrapedPayload = await scrapePostUrl(item.url);
      const useScraped =
        (hasExtractedText(scrapedPayload) || scrapedPayload?.author) &&
        commentaryScore(scrapedPayload) >= commentaryScore(shallowPayload);
      const payload = useScraped
        ? {
            ...shallowPayload,
            ...scrapedPayload,
            author: scrapedPayload.author || shallowPayload.author || null,
            authorHeadline:
              scrapedPayload.authorHeadline || shallowPayload.authorHeadline || null,
            metadata: {
              ...(shallowPayload.metadata || {}),
              ...(scrapedPayload.metadata || {}),
              importedFromSavedPosts: true,
              scrapedFromPostPage: true,
            },
            media:
              Array.isArray(scrapedPayload.media) && scrapedPayload.media.length
                ? scrapedPayload.media
                : shallowPayload.media,
          }
        : shallowPayload;
      if (!payload.url || !payload.text) {
        stats.failed += 1;
        continue;
      }

      const wasExisting = existing.has(item.url);
      const resp = await LIS.capturePayload(payload);
      if (resp?.ok && !resp.post?.duplicate && !resp.post?.skipped) {
        stats.added += 1;
        existing.add(item.url);
      } else if (resp?.ok && resp.post?.duplicate && wasExisting) {
        stats.updated += 1;
        existing.add(item.url);
      } else if (resp?.ok && (resp.post?.duplicate || resp.post?.skipped)) {
        stats.skipped += 1;
        existing.add(item.url);
      } else {
        stats.failed += 1;
      }
    }
  }

  function showProgress(stats, done = false) {
    const parts = [`${stats.added} added`, `${stats.updated} updated`, `${stats.skipped} skipped`];
    if (stats.failed) parts.push(`${stats.failed} failed`);
    LIS.showToast(
      `LinkedIn Saver: ${done ? "import done" : "importing saved posts"} — ${parts.join(", ")}`,
      stats.failed && done ? "error" : "info"
    );
  }

  async function runImport() {
    const existing = await getExistingUrls();
    const seen = new Set();
    const stats = { added: 0, updated: 0, skipped: 0, failed: 0 };
    let lastSeenSize = -1;
    let idleRounds = 0;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      await importVisibleNewItems(existing, seen, stats);
      if (round % 4 === 0) showProgress(stats);

      if (seen.size === lastSeenSize) idleRounds += 1;
      else idleRounds = 0;
      lastSeenSize = seen.size;
      if (idleRounds >= IDLE_ROUNDS) break;

      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(SCROLL_DELAY_MS);
    }

    await importVisibleNewItems(existing, seen, stats);
    if (seen.size === 0) {
      LIS.showToast(
        "LinkedIn Saver: open LinkedIn Saved posts and articles, then try import again",
        "error"
      );
      return stats;
    }

    showProgress(stats, true);
    return stats;
  }

  LIS.importSavedPosts = function importSavedPosts() {
    if (activeImport) return activeImport;
    LIS.showToast("LinkedIn Saver: importing saved posts…", "info");
    activeImport = runImport()
      .catch((err) => {
        LIS.showToast(`LinkedIn Saver: ${err?.message || "import failed"}`, "error");
        return { added: 0, skipped: 0, failed: 1 };
      })
      .finally(() => {
        activeImport = null;
      });
    return activeImport;
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "import-saved-posts") return;
    LIS.importSavedPosts().then((stats) => sendResponse({ ok: true, stats }));
    return true;
  });
})();
