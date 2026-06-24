import { 
  ensureSchema, 
  hasDatabase,
  getAllCollections, 
  createCollection
} from "./_lib/db.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    if (!hasDatabase) return res.status(200).json([]);

    await ensureSchema();
    const collections = await getAllCollections();
    return res.status(200).json(collections);
  }

  if (req.method === "POST") {
    if (!hasDatabase) {
      return res.status(503).json({ error: "Database connection string is not configured" });
    }

    await ensureSchema();
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

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}
