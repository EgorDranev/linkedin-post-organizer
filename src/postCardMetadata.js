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
