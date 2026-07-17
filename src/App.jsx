import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Show, UserButton, useAuth } from "@clerk/react";
import { api, AuthError, setTokenProvider, setUnauthorizedHandler } from "./api.js";
import { AddForm } from "./AddForm.jsx";
import { PostCard } from "./PostCard.jsx";
import { AuthScreen } from "./AuthScreen.jsx";
import { BrowseControls } from "./BrowseControls.jsx";
import { exportPostsCsv } from "./exportCsv.js";
import { CollectionSidebar } from "./CollectionSidebar.jsx";
import { Settings } from "./Settings.jsx";
import { ExtensionConnect } from "./ExtensionConnect.jsx";

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const BookmarkMark = () => (
  <svg width="18" height="18" {...ICON} strokeWidth={2}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="15" height="15" {...ICON}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);
const InboxIcon = () => (
  <svg width="22" height="22" {...ICON}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);
const SearchOffIcon = () => (
  <svg width="22" height="22" {...ICON}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const GearIcon = () => (
  <svg width="15" height="15" {...ICON}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export function Library({ accountButton }) {
  const [posts, setPosts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // browse state
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setSessionExpired(false);
    
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
      if (e instanceof AuthError) {
        setPosts([]);
        setCollections([]);
        setQuery("");
        setActiveTags([]);
        setSelectedCollection(null);
        setSessionExpired(true);
      } else {
        setError(e.message);
      }
    })
    .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Pick up posts saved via the extension while this tab was in the background.
  useEffect(() => {
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
  }, [reload]);

  const onSaved = (post) =>
    setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
  const onUpdated = (post) =>
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));

  // Deleting hides the card immediately but only calls the API after a short
  // undo window, so a misclick on the trash icon never destroys a saved post.
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  toastRef.current = toast;

  const insertPostAt = (list, index, post) => {
    const next = list.filter((p) => p.id !== post.id);
    next.splice(Math.min(index, next.length), 0, post);
    return next;
  };

  const performDelete = useCallback((post, index) => {
    api.deletePost(post.id).catch(() => {
      // Restore the card so a failed delete never silently loses a post.
      setPosts((prev) => insertPostAt(prev, index, post));
      const timer = setTimeout(() => setToast(null), 6000);
      setToast({
        type: "error",
        message: "Couldn’t delete the post — it’s back in your library.",
        timer,
      });
    });
  }, []);

  const requestDelete = (id) => {
    const index = posts.findIndex((p) => p.id === id);
    if (index === -1) return;
    const post = posts[index];
    // A second delete while one is pending commits the first immediately.
    const current = toastRef.current;
    if (current) {
      clearTimeout(current.timer);
      setToast(null);
      if (current.type === "undo") performDelete(current.post, current.index);
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
    const timer = setTimeout(() => {
      setToast(null);
      performDelete(post, index);
    }, 5000);
    setToast({ type: "undo", post, index, timer });
  };

  const undoDelete = () => {
    const current = toastRef.current;
    if (current?.type !== "undo") return;
    clearTimeout(current.timer);
    setPosts((prev) => insertPostAt(prev, current.index, current.post));
    setToast(null);
  };

  // If the library unmounts mid-window, drop the timer without deleting —
  // the post is still on the server and reappears on the next load.
  useEffect(
    () => () => {
      if (toastRef.current) clearTimeout(toastRef.current.timer);
    },
    []
  );

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

  const filtering = query.trim() !== "" || activeTags.length > 0 || selectedCollection !== null;
  const toReview = filtered.filter((p) => p.status === "review");
  const filed = filtered.filter((p) => p.status === "filed");
  const exportLabel = filtering ? "Export filtered CSV" : "Export CSV";

  // Settings replaces the library view; Library stays mounted so a pending
  // delete-undo window still commits (or can be undone on return).
  if (settingsOpen) {
    return (
      <div className="app">
        <Settings onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <BookmarkMark />
            </span>
            <h1>LinkedIn Saver</h1>
          </div>
          <div className="topbar-right">
            <span className="count">
              {filtering ? `${filtered.length} of ${posts.length}` : `${posts.length} saved`}
            </span>
            {posts.length > 0 && (
              <button
                className="topbar-btn export"
                onClick={() => exportPostsCsv(filtered, { filtered: filtering })}
                disabled={filtered.length === 0}
              >
                <DownloadIcon />
                {exportLabel}
              </button>
            )}
            <button className="topbar-btn" onClick={() => setSettingsOpen(true)}>
              <GearIcon />
              Settings
            </button>
            {accountButton}
          </div>
        </div>
      </header>

      <main className="app-body">
        <aside className="sidebar-col">
          <CollectionSidebar
            collections={collections}
            selectedCollection={selectedCollection}
            onSelectCollection={setSelectedCollection}
            onCreateCollection={onCollectionCreated}
            onEditCollection={onCollectionEdited}
            onDeleteCollection={onCollectionDeleted}
          />
        </aside>

        <div className="content-col">
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

          {loading && !sessionExpired && (
            <div className="state">
              <span className="state-icon"><InboxIcon /></span>
              <p>Loading your saved posts…</p>
            </div>
          )}
          {error && (
            <div className="state">
              <span className="state-icon"><SearchOffIcon /></span>
              <p className="error">Can’t reach the server: {error}</p>
            </div>
          )}

          {sessionExpired && (
            <div className="state">
              <span className="state-icon"><SearchOffIcon /></span>
              <p className="error">Your session expired. Sign in again.</p>
            </div>
          )}

          {!loading && !error && !sessionExpired && posts.length === 0 && (
            <div className="state">
              <span className="state-icon"><InboxIcon /></span>
              <p>
                No saved posts yet. Paste one above, or save a post on LinkedIn
                with the browser extension connected.
              </p>
            </div>
          )}

          {!loading && !error && !sessionExpired && posts.length > 0 && filtered.length === 0 && (
            <div className="state">
              <span className="state-icon"><SearchOffIcon /></span>
              <p>No posts match these filters.</p>
            </div>
          )}

          {toReview.length > 0 && (
            <section className="section">
              <h2 className="section-title">
                To review <span className="badge">{toReview.length}</span>
              </h2>
              {toReview.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onUpdated={onUpdated}
                  onDeleted={requestDelete}
                  onTagClick={toggleTag}
                  activeTags={activeTags}
                  collections={collections}
                  onCollectionChange={onCollectionChange}
                />
              ))}
            </section>
          )}

          {filed.length > 0 && (
            <section className="section">
              <h2 className="section-title">Filed</h2>
              {filed.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onUpdated={onUpdated}
                  onDeleted={requestDelete}
                  onTagClick={toggleTag}
                  activeTags={activeTags}
                  collections={collections}
                  onCollectionChange={onCollectionChange}
                />
              ))}
            </section>
          )}
        </div>
      </main>

      {toast && (
        <div
          className={`toast${toast.type === "error" ? " toast--error" : ""}`}
          role="status"
        >
          <span className="toast-msg">
            {toast.type === "undo" ? "Post deleted" : toast.message}
          </span>
          {toast.type === "undo" && (
            <button className="toast-btn" onClick={undoDelete}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { getToken, isLoaded, signOut } = useAuth();

  useLayoutEffect(() => {
    setTokenProvider(getToken);
    setUnauthorizedHandler(signOut);
    return () => {
      setTokenProvider(null);
      setUnauthorizedHandler(null);
    };
  }, [getToken, signOut]);

  if (!isLoaded) return <div className="app" aria-label="Loading account" />;

  // The extension opens /?pairing=<id>; a signed-in user approves it there.
  const pairingId = new URLSearchParams(window.location.search).get("pairing");

  return (
    <>
      <Show when="signed-out">
        <AuthScreen />
      </Show>
      <Show when="signed-in">
        {pairingId ? (
          <ExtensionConnect pairingId={pairingId} />
        ) : (
          <Library accountButton={<UserButton />} />
        )}
      </Show>
    </>
  );
}
