import { 
  ensureSchema, 
  getPostsInCollection,
  hydrate
} from "./_lib/db.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  await ensureSchema();

  const { id } = req.query;

  if (req.method === "GET") {
    if (!id) {
      return res.status(400).json({ error: "Collection ID is required" });
    }

    try {
      const posts = await getPostsInCollection(id);
      return res.status(200).json(posts);
    } catch (error) {
      return res.status(500).json({ error: "Failed to retrieve posts in collection" });
    }
  }

  res.setHeader("Allow", "GET");
  res.status(405).json({ error: "Method not allowed" });
}