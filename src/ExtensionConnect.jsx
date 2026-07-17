import { useState } from "react";
import { api } from "./api.js";

export function ExtensionConnect({ pairingId }) {
  const [state, setState] = useState("ready");

  async function approve() {
    setState("working");
    try {
      await api.approvePairing(pairingId);
      setState("approved");
    } catch {
      setState("error");
    }
  }

  if (!pairingId) return <p>This connection link is incomplete.</p>;
  if (state === "approved") {
    return (
      <main className="connect-card">
        <h1>Extension connected</h1>
        <p>You can close this tab.</p>
      </main>
    );
  }
  return (
    <main className="connect-card">
      <h1>Connect LinkedIn Saver?</h1>
      <p>
        When you choose Save on LinkedIn, the extension sends that post's visible
        content to your private library.
      </p>
      <button disabled={state === "working"} onClick={approve}>
        Connect extension
      </button>
      {state === "error" && (
        <p className="error">This request expired. Start again from the extension.</p>
      )}
    </main>
  );
}
