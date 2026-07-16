import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyToken, findExtensionToken } = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  findExtensionToken: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({ verifyToken }));
vi.mock("../api/_lib/db.js", () => ({
  findExtensionToken,
}));

import { authenticateRequest, requireUser } from "../api/_lib/auth.js";
import { response } from "./helpers/http.js";

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

  it("accepts a lowercase bearer scheme", async () => {
    verifyToken.mockResolvedValue({ sub: "user_a" });
    const actor = await authenticateRequest({
      headers: { authorization: "bearer clerk_session" },
    });
    expect(actor).toEqual({ userId: "user_a", kind: "web" });
  });

  it("fails closed when APP_ORIGIN is not configured", async () => {
    delete process.env.APP_ORIGIN;
    verifyToken.mockResolvedValue({ sub: "user_a" });
    await expect(
      authenticateRequest({ headers: { authorization: "Bearer clerk_session" } })
    ).rejects.toThrow("APP_ORIGIN");
  });
});

describe("requireUser", () => {
  beforeEach(() => {
    process.env.CLERK_SECRET_KEY = "sk_test";
    process.env.APP_ORIGIN = "https://linkedin-saver.vercel.app";
  });

  it("responds 500 without leaking internals when the token lookup fails", async () => {
    findExtensionToken.mockRejectedValue(new Error("connect ECONNREFUSED neon"));
    const res = response();
    const actor = await requireUser(
      { headers: { authorization: "Bearer lis_ext_secret" } },
      res
    );
    expect(actor).toBeNull();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "internal error" });
  });

  it("responds 401 with the auth message for a revoked extension token", async () => {
    findExtensionToken.mockResolvedValue(null);
    const res = response();
    const actor = await requireUser(
      { headers: { authorization: "Bearer lis_ext_secret" } },
      res
    );
    expect(actor).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "extension token is invalid or revoked" });
  });
});
