import { describe, expect, it, vi } from "vitest";
import { request, response } from "./helpers/http.js";

// 43 characters — the handlers require a 32–256 character verifier.
const VERIFIER = "0123456789abcdefghijklmnopqrstuvwxyz0123456";

const { createPairing, approvePairing, redeemPairing } = vi.hoisted(() => ({
  createPairing: vi.fn().mockResolvedValue({ id: "pair_1", expiresAt: "2026-07-14T12:10:00Z" }),
  approvePairing: vi.fn().mockResolvedValue(true),
  redeemPairing: vi.fn().mockResolvedValue({ token: "lis_ext_once", tokenId: "ext_1" }),
}));
vi.mock("../api/_lib/db.js", () => ({ createPairing, approvePairing, redeemPairing }));
vi.mock("../api/_lib/auth.js", () => ({
  hashSecret: (value) => `hash:${value}`,
  requireUser: vi.fn().mockResolvedValue({ userId: "user_a", kind: "web" }),
}));

import createHandler from "../api/extension/pairings.js";
import approveHandler from "../api/extension/pairings/[id].js";
import redeemHandler from "../api/extension/pairings/[id]/redeem.js";

describe("extension pairing", () => {
  it("creates, approves, and redeems a verifier once", async () => {
    const created = response();
    await createHandler(request({ method: "POST", body: { verifier: VERIFIER } }), created);
    expect(created.body.id).toBe("pair_1");

    const approved = response();
    await approveHandler(request({ method: "PATCH", query: { id: "pair_1" } }), approved);
    expect(approvePairing).toHaveBeenCalledWith("pair_1", "user_a");

    const redeemed = response();
    await redeemHandler(
      request({ method: "POST", query: { id: "pair_1" }, body: { verifier: VERIFIER } }),
      redeemed
    );
    expect(redeemed.body.token).toBe("lis_ext_once");
  });
});
