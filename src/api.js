export class AuthError extends Error {}

const json = (r) => {
  if (r.status === 401) throw new AuthError("unauthorized");
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.status === 204 ? null : r.json();
};

export const api = {
  // auth
  session: () => fetch("/api/session").then((r) => r.json()),
  login: (password) =>
    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  logout: () => fetch("/api/logout", { method: "POST" }),

  // posts
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

  // collections
  getCollections: () => fetch("/api/collections").then(json),
  createCollection: (collection) =>
    fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collection),
    }).then(json),
  updateCollection: (id, collection) =>
    fetch(`/api/collections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collection),
    }).then(json),
  deleteCollection: (id) => fetch(`/api/collections/${id}`, { method: "DELETE" }).then(json),
  addPostToCollection: (postId, collectionId) =>
    fetch("/api/post-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, collectionId }),
    }).then(json),
  removePostFromCollection: (postId, collectionId) =>
    fetch("/api/post-collection", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, collectionId }),
    }).then(json),
  getPostsInCollection: (collectionId) => fetch(`/api/collections/${collectionId}/posts`).then(json),
};
