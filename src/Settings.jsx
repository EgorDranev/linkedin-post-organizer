import { useState } from "react";
import { api } from "./api.js";
import { exportPostsCsv } from "./exportCsv.js";

export function Settings({ onClose }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  async function exportLibrary() {
    setExportError("");
    setExporting(true);
    try {
      const posts = await api.listPosts();
      exportPostsCsv(posts);
    } catch {
      setExportError("We couldn't export your library. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function removeAccount() {
    setError("");
    setDeleting(true);
    try {
      await api.deleteAccount();
      window.location.assign("/");
    } catch (err) {
      // The server's message is precise about what was and wasn't deleted —
      // prefer it over a generic claim that nothing happened.
      setError(
        err?.serverMessage ||
          "We couldn't delete your account. Please try again or contact support."
      );
      setDeleting(false);
    }
  }

  return (
    <section className="settings" aria-label="Settings">
      <button className="ghost" onClick={onClose}>Back to library</button>
      <h1>Settings</h1>

      <h2>Export your library (CSV)</h2>
      <p>Download every saved post — text, tags, links, and metadata — as a CSV file.</p>
      <button className="ghost" onClick={exportLibrary} disabled={exporting}>
        {exporting ? "Exporting…" : "Export your library (CSV)"}
      </button>
      {exportError && <p className="error">{exportError}</p>}

      <h2>Delete account</h2>
      <p>This permanently deletes your saved posts, tags, and extension connections.</p>
      {!confirming ? (
        <button className="danger" onClick={() => setConfirming(true)}>Delete my account</button>
      ) : (
        <div className="danger-confirm">
          <p>This cannot be undone.</p>
          <button className="danger" onClick={removeAccount} disabled={deleting}>
            {deleting ? "Deleting…" : "Permanently delete"}
          </button>
          <button className="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
            Cancel
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
