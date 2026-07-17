import { beforeEach, describe, expect, it, vi } from "vitest";
import { request, response } from "./helpers/http.js";

const { requireUser, deleteUserData, deleteUser, ensureSchema } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  deleteUserData: vi.fn(),
  deleteUser: vi.fn(),
  ensureSchema: vi.fn(),
}));
vi.mock("../api/_lib/auth.js", () => ({ requireUser }));
vi.mock("../api/_lib/db.js", () => ({ deleteUserData, ensureSchema, hasDatabase: true }));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { deleteUser } }),
}));

import handler from "../api/account.js";

describe("DELETE /api/account", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({ userId: "user_a", kind: "web" });
    deleteUserData.mockResolvedValue(undefined);
    deleteUser.mockResolvedValue(undefined);
  });

  it("deletes owned data before deleting the identity", async () => {
    const res = response();
    await handler(request({ method: "DELETE" }), res);
    expect(deleteUserData).toHaveBeenCalledWith("user_a");
    expect(deleteUser).toHaveBeenCalledWith("user_a");
    expect(deleteUserData.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0]
    );
    expect(res.statusCode).toBe(204);
  });

  it("requires a web session, not an extension token", async () => {
    const res = response();
    await handler(request({ method: "DELETE" }), res);
    expect(requireUser).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      webOnly: true,
    });
  });

  it("reports data-still-intact when the library deletion fails", async () => {
    deleteUserData.mockRejectedValue(new Error("neon down"));
    const res = response();
    await handler(request({ method: "DELETE" }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/safe to try again/i);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("is honest when data is gone but the identity deletion fails", async () => {
    deleteUser.mockRejectedValue(Object.assign(new Error("clerk 500"), { status: 500 }));
    const res = response();
    await handler(request({ method: "DELETE" }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/library data was deleted/i);
  });

  it("treats an already-deleted identity as success", async () => {
    deleteUser.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    const res = response();
    await handler(request({ method: "DELETE" }), res);
    expect(res.statusCode).toBe(204);
  });
});
