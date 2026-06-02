import { useCallback, useEffect, useMemo, useState } from "react";
import { api, AuthError } from "./api.js";
import { AddForm } from "./AddForm.jsx";
import { PostCard } from "./PostCard.jsx";
import { Login } from "./Login.jsx";
import { BrowseControls } from "./BrowseControls.jsx";
import { exportPostsCsv } from "./exportCsv.js";
import { CollectionSidebar } from "./CollectionSidebar.jsx";

export default function App() {
  const [authed, setAuthed] = useState(null); // null = unknown, false = locked, true = ok
  const [posts, setPosts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // browse state
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);

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
    
    // Load both posts and collections
    Promise.all([
      api.listPosts(),
      api.getCollections()
    ])
    .then(([loadedPosts, loadedCollections]) => {
      setPosts(loadedPosts);
      
      // Add post count to each collection
      const collectionsWithCounts = loadedCollections.map(collection => {
        const postCount = loadedPosts.filter(post => 
          post.collections.some(c => c.id === collection.id)
        ).length;
        return { ...collection, postCount };
      });
      
      setCollections(collectionsWithCounts);
    })
    .catch((e) => {
      if (e instanceof AuthError) setAuthed(false);
      else setError(e.message);
    })
    .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (authed) reload();
  }, [authed, reload]);

  // Pick up posts saved via the extension while this tab was in the background.
  useEffect(() => {
    if (!authed) return;
    let lastReload = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastReload < 30_000) return;
      lastReload = now;
      reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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

  // Update collection in state when a post's collections change
  const onCollectionChange = (postId, newCollections) => {
    setPosts(prev => 
      prev.map(p => 
        p.id === postId ? { ...p, collections: newCollections } : p
      )
    );
  };

  // Add a new collection to state
  const onCollectionCreated = (newCollection) => {
    setCollections(prev => [...prev, { ...newCollection, postCount: 0 }]);
  };

  // Update a collection in state
  const onCollectionEdited = (updatedCollection) => {
    setCollections(prev => 
      prev.map(c => c.id === updatedCollection.id ? updatedCollection : c)
    );
  };

  // Remove a collection from state
  const onCollectionDeleted = (deletedId) => {
    setCollections(prev => prev.filter(c => c.id !== deletedId));
    // If the deleted collection was selected, go back to all posts
    if (selectedCollection && selectedCollection.id === deletedId) {
      setSelectedCollection(null);
    }
  };

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

  // Apply search + tag + collection filters. Tags combine with AND (narrowing).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      const matchesQuery =
        !q ||
        p.text.toLowerCase().includes(q) ||
        (p.author || "").toLowerCase().includes(q);
      const matchesTags = activeTags.every((t) => p.tags.includes(t));
      const matchesCollection = !selectedCollection || p.collections.some(c => c.id === selectedCollection.id);
      return matchesQuery && matchesTags && matchesCollection;
    });
  }, [posts, query, activeTags, selectedCollection]);

  const toggleTag = (name) =>
    setActiveTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  const clearFilters = () => {
    setQuery("");
    setActiveTags([]);
    setSelectedCollection(null);
  };

  if (authed === null) return <div className="app" />;
  if (authed === false) return <Login onAuthed={() => setAuthed(true)} />;

  const filtering = query.trim() !== "" || activeTags.length > 0 || selectedCollection !== null;
  const toReview = filtered.filter((p) => p.status === "review");
  const filed = filtered.filter((p) => p.status === "filed");
  const exportLabel = filtering ? "Export filtered CSV" : "Export CSV";

  return (
    <div className="app">
      <header className="topbar">
        <h1>LinkedIn Saver</h1>
        <div className="topbar-right">
          <span className="count">
            {filtering ? `${filtered.length} of ${posts.length}` : `${posts.length} saved`}
          </span>
          {posts.length > 0 && (
            <button
              className="link export"
              onClick={() => exportPostsCsv(filtered, { filtered: filtering })}
              disabled={filtered.length === 0}
            >
              {exportLabel}
            </button>
          )}
          <button className="link logout" onClick={logout}>
            Lock
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ minWidth: '250px' }}>
          <CollectionSidebar
            collections={collections}
            selectedCollection={selectedCollection}
            onSelectCollection={setSelectedCollection}
            onCreateCollection={onCollectionCreated}
            onEditCollection={onCollectionEdited}
            onDeleteCollection={onCollectionDeleted}
          />
        </div>

        <div style={{ flex: 1 }}>
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
              No saved posts yet. Paste one above, or save a post on LinkedIn with
              the browser extension connected.
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
                  collections={collections}
                  onCollectionChange={onCollectionChange}
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
                  collections={collections}
                  onCollectionChange={onCollectionChange}
                />
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
