import {
  ensureSchema,
  getCollectionById,
  updateCollection,
  deleteCollection,
} from "../_lib/db.js";
import { requireAuth } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  await ensureSchema();

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Collection ID is required" });
  }

  if (req.method === "GET") {
    const collection = await getCollectionById(id);
    return collection
      ? res.status(200).json(collection)
      : res.status(404).json({ error: "Collection not found" });
  }

  if (req.method === "PUT") {
    const { name, description } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    try {
      const collection = await updateCollection(
        id,
        name.trim(),
        description?.trim() || null
      );
      return collection
        ? res.status(200).json(collection)
        : res.status(404).json({ error: "Collection not found" });
    } catch {
      return res.status(500).json({ error: "Failed to update collection" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const collection = await getCollectionById(id);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      await deleteCollection(id);
      return res.status(204).end();
    } catch {
      return res.status(500).json({ error: "Failed to delete collection" });
    }
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}
