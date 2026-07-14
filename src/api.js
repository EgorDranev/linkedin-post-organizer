export class AuthError extends Error {}

let tokenProvider = null;

export function setTokenProvider(provider) {
  tokenProvider = provider;
}

const json = (r) => {
  if (r.status === 401) throw new AuthError("unauthorized");
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.status === 204 ? null : r.json();
};

async function request(path, init = {}) {
  const token = tokenProvider ? await tokenProvider() : null;
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  return json(response);
}

export const api = {
  // posts
  listPosts: () => request("/api/posts"),
  savePost: (body) =>
    request("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updatePost: (id, body) =>
    request(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deletePost: (id) => request(`/api/posts/${id}`, { method: "DELETE" }),

  // collections
  getCollections: () => request("/api/collections"),
  createCollection: (collection) =>
    request("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collection),
    }),
  updateCollection: (id, collection) =>
    request(`/api/collections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collection),
    }),
  deleteCollection: (id) => request(`/api/collections/${id}`, { method: "DELETE" }),
  addPostToCollection: (postId, collectionId) =>
    request("/api/post-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, collectionId }),
    }),
  removePostFromCollection: (postId, collectionId) =>
    request("/api/post-collection", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, collectionId }),
    }),
  getPostsInCollection: (collectionId) => request(`/api/collections/${collectionId}/posts`),
};
