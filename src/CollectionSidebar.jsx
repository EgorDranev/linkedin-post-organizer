import { useState, useEffect } from "react";
import { api } from "../api.js";

export function CollectionSidebar({ 
  selectedCollection, 
  onSelectCollection, 
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  collections = []
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDesc, setNewCollectionDesc] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const handleCreateCollection = async (e) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;

    try {
      const newCollection = await api.createCollection({
        name: newCollectionName.trim(),
        description: newCollectionDesc.trim() || null
      });
      
      onCreateCollection && onCreateCollection(newCollection);
      setNewCollectionName("");
      setNewCollectionDesc("");
      setShowCreateForm(false);
    } catch (error) {
      console.error("Error creating collection:", error);
    }
  };

  const startEditing = (collection) => {
    setEditingId(collection.id);
    setEditName(collection.name);
    setEditDesc(collection.description || "");
  };

  const handleUpdateCollection = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;

    try {
      const updatedCollection = await api.updateCollection(editingId, {
        name: editName.trim(),
        description: editDesc.trim() || null
      });
      
      onEditCollection && onEditCollection(updatedCollection);
      setEditingId(null);
    } catch (error) {
      console.error("Error updating collection:", error);
    }
  };

  const handleDeleteCollection = async (id) => {
    try {
      await api.deleteCollection(id);
      onDeleteCollection && onDeleteCollection(id);
    } catch (error) {
      console.error("Error deleting collection:", error);
    }
  };

  return (
    <div className="collection-sidebar">
      <div className="collection-controls">
        <h3>Collections</h3>
        {!showCreateForm ? (
          <button 
            className="btn-secondary"
            onClick={() => setShowCreateForm(true)}
          >
            + New Collection
          </button>
        ) : (
          <form onSubmit={handleCreateCollection} className="collection-create-form">
            <input
              type="text"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              required
            />
            <textarea
              placeholder="Description (optional)"
              value={newCollectionDesc}
              onChange={(e) => setNewCollectionDesc(e.target.value)}
            />
            <div className="form-buttons">
              <button type="submit" className="btn-primary">Create</button>
              <button 
                type="button" 
                className="btn-secondary"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewCollectionName("");
                  setNewCollectionDesc("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <ul className="collection-list">
        <li>
          <button
            className={`collection-item ${selectedCollection === null ? 'active' : ''}`}
            onClick={() => onSelectCollection(null)}
          >
            All Posts
            <span className="collection-count"></span>
          </button>
        </li>
        
        {collections.map((collection) => (
          <li key={collection.id}>
            {editingId === collection.id ? (
              <form onSubmit={handleUpdateCollection} className="collection-edit-form">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
                <div className="form-buttons">
                  <button type="submit" className="btn-primary">Save</button>
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="collection-item-wrapper">
                <button
                  className={`collection-item ${selectedCollection?.id === collection.id ? 'active' : ''}`}
                  onClick={() => onSelectCollection(collection)}
                >
                  <span className="collection-name">{collection.name}</span>
                  <span className="collection-count">
                    {collection.postCount !== undefined ? `(${collection.postCount})` : ''}
                  </span>
                </button>
                <div className="collection-actions">
                  <button 
                    className="action-btn edit-btn"
                    onClick={() => startEditing(collection)}
                    title="Edit collection"
                  >
                    ✏️
                  </button>
                  <button 
                    className="action-btn delete-btn"
                    onClick={() => handleDeleteCollection(collection.id)}
                    title="Delete collection"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}