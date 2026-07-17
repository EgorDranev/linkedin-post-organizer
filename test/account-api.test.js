import { describe, expect, it, vi } from "vitest";
import { request, response } from "./helpers/http.js";

const { requireUser, deleteUserData, deleteUser } = vi.hoisted(() => ({
  requireUser: vi.fn().mockResolvedValue({ userId: "user_a", kind: "web" }),
  deleteUserData: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("../api/_lib/auth.js", () => ({ requireUser }));
vi.mock("../api/_lib/db.js", () => ({ deleteUserData }));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { deleteUser } }),
}));

import handler from "../api/account.js";

describe("DELETE /api/account", () => {
  it("deletes owned data before deleting the identity", async () => {
    const res = response();
    await handler(request({ method: "DELETE" }), res);
    expect(deleteUserData).toHaveBeenCalledWith("user_a");
    expect(deleteUser).toHaveBeenCalledWith("user_a");
    expect(res.statusCode).toBe(204);
  });
});
