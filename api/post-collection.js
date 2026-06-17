import { 
  ensureSchema, 
  addPostToCollection,
  removePostFromCollection,
  getPost
} from "./_lib/db.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  await ensureSchema();

  if (req.method === "POST") {
    const { postId, collectionId } = req.body;
    
    if (!postId || !collectionId) {
      return res.status(400).json({ error: "postId and collectionId are required" });
    }

    try {
      await addPostToCollection(postId, collectionId);
      
      // Return updated post data
      const updatedPost = await getPost(postId);
      return res.status(200).json(updatedPost);
    } catch (error) {
      return res.status(500).json({ error: "Failed to add post to collection" });
    }
  }

  if (req.method === "DELETE") {
    const { postId, collectionId } = req.body;
    
    if (!postId || !collectionId) {
      return res.status(400).json({ error: "postId and collectionId are required" });
    }

    try {
      await removePostFromCollection(postId, collectionId);
      
      // Return updated post data
      const updatedPost = await getPost(postId);
      return res.status(200).json(updatedPost);
    } catch (error) {
      return res.status(500).json({ error: "Failed to remove post from collection" });
    }
  }

  res.setHeader("Allow", "POST, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}