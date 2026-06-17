// Search box + tag filter chips. Filtering is client-side (all posts are
// already loaded), so it's instant and stays in sync as tags are edited.

export function BrowseControls({
  query,
  onQuery,
  tagCounts,
  activeTags,
  onToggleTag,
  onClear,
}) {
  const hasFilters = query.trim() !== "" || activeTags.length > 0;

  return (
    <div className="browse">
      <div className="browse-search">
        <svg
          className="search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          aria-label="Search saved posts"
          placeholder="Search saved posts…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        {hasFilters && (
          <button className="link clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      {tagCounts.length > 0 && (
        <div className="browse-tags">
          {tagCounts.map(({ name, count }) => {
            const active = activeTags.includes(name);
            return (
              <button
                key={name}
                className={`filter-chip${active ? " active" : ""}`}
                onClick={() => onToggleTag(name)}
              >
                {name}
                <span className="filter-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
