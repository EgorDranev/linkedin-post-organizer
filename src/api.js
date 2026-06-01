const json = (r) => {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.status === 204 ? null : r.json();
};

export const api = {
  listPosts: () => fetch("/api/posts").then(json),
  savePost: (body) =>
    fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),
  updatePost: (id, body) =>
    fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),
  deletePost: (id) => fetch(`/api/posts/${id}`, { method: "DELETE" }).then(json),
};
