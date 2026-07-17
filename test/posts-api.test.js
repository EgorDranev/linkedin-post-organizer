import { beforeEach, describe, expect, it, vi } from "vitest";
import { request, response } from "./helpers/http.js";

const { requireUser, sql, hydrate } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sql: vi.fn(),
  hydrate: vi.fn(),
}));
vi.mock("../api/_lib/auth.js", () => ({ requireUser }));
vi.mock("../api/_lib/db.js", () => ({
  ensureSchema: vi.fn(), hasDatabase: true, sql, hydrate,
  allTags: vi.fn().mockResolvedValue([]), getPost: vi.fn(),
}));
vi.mock("../api/_lib/ai.js", () => ({ suggestTagsAI: vi.fn().mockResolvedValue([]) }));

import postsHandler from "../api/posts.js";

describe("posts API ownership", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({ userId: "user_a", kind: "web" });
  });

  it("passes the owner to hydration for list responses", async () => {
    sql.mockResolvedValue([{ id: 1, user_id: "user_a" }]);
    hydrate.mockResolvedValue({ id: 1 });
    const res = response();
    await postsHandler(request(), res);
    expect(hydrate).toHaveBeenCalledWith("user_a", expect.objectContaining({ id: 1 }));
  });

  it("does not continue when authentication fails", async () => {
    requireUser.mockImplementation(async (_req, res) => {
      res.status(401).json({ error: "unauthorized" });
      return null;
    });
    const res = response();
    await postsHandler(request(), res);
    expect(res.statusCode).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});
