import { useCallback, useEffect, useMemo, useState } from "react";
import { api, AuthError } from "./api.js";
import { AddForm } from "./AddForm.jsx";
import { PostCard } from "./PostCard.jsx";
import { Login } from "./Login.jsx";
import { BrowseControls } from "./BrowseControls.jsx";

export default function App() {
  const [authed, setAuthed] = useState(null); // null = unknown, false = locked, true = ok
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // browse state
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState([]);

  // Decide whether to show the login gate.
  useEffect(() => {
    api
      .session()
      .then(({ authed, gate }) => setAuthed(!gate || authed))
      .catch(() => setAuthed(true)); // if session check fails, fall through to data load
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listPosts()
      .then(setPosts)
      .catch((e) => {
        if (e instanceof AuthError) setAuthed(false);
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (authed) reload();
  }, [authed, reload]);

  const logout = async () => {
    await api.logout();
    setAuthed(false);
    setPosts([]);
  };

  const onSaved = (post) =>
    setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
  const onUpdated = (post) =>
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
  const onDeleted = (id) => setPosts((prev) => prev.filter((p) => p.id !== id));

  // Tag vocabulary + counts, derived from accepted tags on loaded posts.
  const tagCounts = useMemo(() => {
    const counts = new Map();
    for (const p of posts) {
      for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [posts]);

  // Apply search + tag filters. Tags combine with AND (narrowing).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      const matchesQuery =
        !q ||
        p.text.toLowerCase().includes(q) ||
        (p.author || "").toLowerCase().includes(q);
      const matchesTags = activeTags.every((t) => p.tags.includes(t));
      return matchesQuery && matchesTags;
    });
  }, [posts, query, activeTags]);

  const toggleTag = (name) =>
    setActiveTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  const clearFilters = () => {
    setQuery("");
    setActiveTags([]);
  };

  if (authed === null) return <div className="app" />;
  if (authed === false) return <Login onAuthed={() => setAuthed(true)} />;

  const filtering = query.trim() !== "" || activeTags.length > 0;
  const toReview = filtered.filter((p) => p.status === "review");
  const filed = filtered.filter((p) => p.status === "filed");

  return (
    <div className="app">
      <header className="topbar">
        <h1>LinkedIn Saver</h1>
        <div className="topbar-right">
          <span className="count">
            {filtering ? `${filtered.length} of ${posts.length}` : `${posts.length} saved`}
          </span>
          <button className="link logout" onClick={logout}>
            Lock
          </button>
        </div>
      </header>

      <AddForm onSaved={onSaved} />

      {posts.length > 0 && (
        <BrowseControls
          query={query}
          onQuery={setQuery}
          tagCounts={tagCounts}
          activeTags={activeTags}
          onToggleTag={toggleTag}
          onClear={clearFilters}
        />
      )}

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">Can’t reach the server: {error}</p>}

      {!loading && !error && posts.length === 0 && (
        <p className="muted empty">
          No saved posts yet. Paste one above, or use the browser extension on
          LinkedIn.
        </p>
      )}

      {!loading && !error && posts.length > 0 && filtered.length === 0 && (
        <p className="muted empty">No posts match these filters.</p>
      )}

      {toReview.length > 0 && (
        <section>
          <h2 className="section-title">
            To review <span className="badge">{toReview.length}</span>
          </h2>
          {toReview.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
              onTagClick={toggleTag}
              activeTags={activeTags}
            />
          ))}
        </section>
      )}

      {filed.length > 0 && (
        <section>
          <h2 className="section-title">Filed</h2>
          {filed.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
              onTagClick={toggleTag}
              activeTags={activeTags}
            />
          ))}
        </section>
      )}
    </div>
  );
}
