import { 
  ensureSchema, 
  getAllCollections, 
  getCollectionById, 
  createCollection, 
  updateCollection, 
  deleteCollection,
  getPostsInCollection,
  addPostToCollection,
  removePostFromCollection
} from "./_lib/db.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  await ensureSchema();

  const { id } = req.query;

  if (req.method === "GET") {
    if (id) {
      // Get specific collection
      const collection = await getCollectionById(id);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      return res.status(200).json(collection);
    } else {
      // Get all collections
      const collections = await getAllCollections();
      return res.status(200).json(collections);
    }
  }

  if (req.method === "POST") {
    const { name, description } = req.body;
    
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    try {
      const collection = await createCollection(name.trim(), description?.trim() || null);
      return res.status(201).json(collection);
    } catch (error) {
      return res.status(500).json({ error: "Failed to create collection" });
    }
  }

  if (req.method === "PUT") {
    if (!id) {
      return res.status(400).json({ error: "Collection ID is required" });
    }

    const { name, description } = req.body;
    
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    try {
      const collection = await updateCollection(id, name.trim(), description?.trim() || null);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      return res.status(200).json(collection);
    } catch (error) {
      return res.status(500).json({ error: "Failed to update collection" });
    }
  }

  if (req.method === "DELETE") {
    if (!id) {
      return res.status(400).json({ error: "Collection ID is required" });
    }

    try {
      await deleteCollection(id);
      return res.status(200).json({ message: "Collection deleted" });
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete collection" });
    }
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}