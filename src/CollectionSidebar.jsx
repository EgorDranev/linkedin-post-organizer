import { useState, useEffect } from "react";
import { api } from "./api.js";

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};
const PlusIcon = () => (
  <svg width="14" height="14" {...ICON}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);
const EditIcon = () => (
  <svg width="15" height="15" {...ICON}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const TrashIcon = () => (
  <svg width="15" height="15" {...ICON}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

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
            className="collection-new-btn"
            onClick={() => setShowCreateForm(true)}
          >
            <PlusIcon />
            New collection
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
                    aria-label={`Edit ${collection.name}`}
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => handleDeleteCollection(collection.id)}
                    title="Delete collection"
                    aria-label={`Delete ${collection.name}`}
                  >
                    <TrashIcon />
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