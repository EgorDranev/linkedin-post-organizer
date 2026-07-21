const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_FORMATTER.format(date).replace(",", "");
}

export function postCardDate(post) {
  const publishedDate = formatDate(post?.metadata?.publishedDate);
  if (publishedDate) {
    return { text: publishedDate, title: `Published ${publishedDate}` };
  }

  const publishedText = String(post?.metadata?.publishedText || "").trim();
  if (publishedText) {
    return { text: publishedText, title: `Published ${publishedText}` };
  }

  const savedDate = formatDate(post?.savedAt);
  if (savedDate) {
    const text = `Saved ${savedDate}`;
    return { text, title: text };
  }

  return null;
}

export function postCardConnectionDegree(post) {
  const value = String(post?.metadata?.connectionDegree || "")
    .trim()
    .toLowerCase();
  return /^(?:1st|2nd|3rd)$/.test(value) ? value : "";
}

export function postCardAuthorAction(post) {
  const action = post?.metadata?.authorAction;
  const text = String(action?.text || "").trim();
  if (!text) return null;

  try {
    const url = new URL(String(action?.url || ""));
    if (!/^https?:$/.test(url.protocol)) return null;
    return { text, url: url.href };
  } catch {
    return null;
  }
}

export function postCardIsPublic(post) {
  return post?.metadata?.visibility === "public";
}
