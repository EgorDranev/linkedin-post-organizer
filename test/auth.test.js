import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyToken, findExtensionToken } = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  findExtensionToken: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({ verifyToken }));
vi.mock("../api/_lib/db.js", () => ({
  findExtensionToken,
}));

import { authenticateRequest } from "../api/_lib/auth.js";

describe("authenticateRequest", () => {
  beforeEach(() => {
    process.env.CLERK_SECRET_KEY = "sk_test";
    process.env.APP_ORIGIN = "https://linkedin-saver.vercel.app";
  });

  it("returns the Clerk subject for a valid web token", async () => {
    verifyToken.mockResolvedValue({ sub: "user_a" });
    const actor = await authenticateRequest({
      headers: { authorization: "Bearer clerk_session" },
    });
    expect(actor).toEqual({ userId: "user_a", kind: "web" });
  });

  it("returns the token owner for an active extension token", async () => {
    findExtensionToken.mockResolvedValue({ userId: "user_b", id: "token_1" });
    const actor = await authenticateRequest({
      headers: { authorization: "Bearer lis_ext_secret" },
    });
    expect(actor).toEqual({ userId: "user_b", kind: "extension", tokenId: "token_1" });
  });

  it("rejects a missing bearer token", async () => {
    await expect(authenticateRequest({ headers: {} })).rejects.toMatchObject({ statusCode: 401 });
  });
});
