import { useEffect, useState } from "react";
import { api } from "./api.js";
import { AddForm } from "./AddForm.jsx";
import { PostCard } from "./PostCard.jsx";

export default function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = () =>
    api
      .listPosts()
      .then(setPosts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const onSaved = (post) =>
    setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);

  const onUpdated = (post) =>
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));

  const onDeleted = (id) =>
    setPosts((prev) => prev.filter((p) => p.id !== id));

  const toReview = posts.filter((p) => p.status === "review");
  const filed = posts.filter((p) => p.status === "filed");

  return (
    <div className="app">
      <header className="topbar">
        <h1>LinkedIn Saver</h1>
        <span className="count">{posts.length} saved</span>
      </header>

      <AddForm onSaved={onSaved} />

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">Can’t reach the server: {error}</p>}

      {!loading && !error && posts.length === 0 && (
        <p className="muted empty">
          No saved posts yet. Paste one above, or use the browser extension on
          LinkedIn.
        </p>
      )}

      {toReview.length > 0 && (
        <section>
          <h2 className="section-title">
            To review <span className="badge">{toReview.length}</span>
          </h2>
          {toReview.map((p) => (
            <PostCard key={p.id} post={p} onUpdated={onUpdated} onDeleted={onDeleted} />
          ))}
        </section>
      )}

      {filed.length > 0 && (
        <section>
          <h2 className="section-title">Filed</h2>
          {filed.map((p) => (
            <PostCard key={p.id} post={p} onUpdated={onUpdated} onDeleted={onDeleted} />
          ))}
        </section>
      )}
    </div>
  );
}
