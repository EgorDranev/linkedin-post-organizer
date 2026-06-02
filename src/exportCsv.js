const CSV_COLUMNS = [
  ["savedAt", "Saved at"],
  ["author", "Author"],
  ["authorHeadline", "Author headline"],
  ["text", "Text"],
  ["links", "Links"],
  ["metadata", "Metadata"],
  ["media", "Media"],
  ["tags", "Tags"],
  ["url", "URL"],
  ["status", "Status"],
];

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function filenameFromDate() {
  return new Date().toISOString().slice(0, 10);
}

export function exportPostsCsv(posts, { filtered = false } = {}) {
  const header = CSV_COLUMNS.map(([, label]) => csvCell(label)).join(",");
  const rows = posts.map((post) =>
    CSV_COLUMNS.map(([key]) => {
      if (key === "tags") return csvCell((post.tags || []).join(", "));
      if (key === "savedAt") return csvCell(new Date(post.savedAt).toISOString());
      if (key === "links") {
        return csvCell(
          (post.metadata?.links || [])
            .map((item) => item?.url)
            .filter(Boolean)
            .join("\n")
        );
      }
      if (key === "metadata") return csvCell(JSON.stringify(post.metadata || {}));
      if (key === "media") return csvCell(JSON.stringify(post.media || []));
      return csvCell(post[key]);
    }).join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `linkedin-saver-${filtered ? "filtered-" : ""}${filenameFromDate()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
