import { beforeEach, describe, expect, it, vi } from "vitest";
import { request, response } from "./helpers/http.js";

const { requireUser, sql, hydrate, getPost, setPostTags } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sql: vi.fn(),
  hydrate: vi.fn(),
  getPost: vi.fn(),
  setPostTags: vi.fn(),
}));
vi.mock("../api/_lib/auth.js", () => ({ requireUser }));
vi.mock("../api/_lib/db.js", () => ({
  ensureSchema: vi.fn(), hasDatabase: true, sql, hydrate,
  allTags: vi.fn().mockResolvedValue([]), getPost, setPostTags,
}));
vi.mock("../api/_lib/ai.js", () => ({ suggestTagsAI: vi.fn().mockResolvedValue([]) }));

import postsHandler from "../api/posts.js";
import postHandler from "../api/posts/[id].js";

// The sql mock is a tagged template: calls arrive as (strings[], ...values).
const sqlCallText = (call) => call[0].join(" ").replace(/\s+/g, " ");
const sqlCallValues = (call) => call.slice(1);

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

  it("binds the owner into the list query itself", async () => {
    sql.mockResolvedValue([]);
    await postsHandler(request(), response());
    const [call] = sql.mock.calls;
    expect(sqlCallText(call)).toContain("user_id =");
    expect(sqlCallValues(call)).toContain("user_a");
  });

  it("answers duplicate when a concurrent capture wins the insert race", async () => {
    sql.mockImplementation(async (strings) => {
      const text = strings.join(" ");
      if (text.includes("INSERT INTO posts")) return []; // ON CONFLICT DO NOTHING
      if (text.includes("SELECT id FROM posts")) {
        // First lookup misses; the re-select after the conflict finds the winner.
        return sql.mock.calls.filter((c) => c[0].join(" ").includes("SELECT id")).length > 1
          ? [{ id: 7 }]
          : [];
      }
      return [];
    });
    getPost.mockResolvedValue({ id: 7, text: "raced" });
    const res = response();
    await postsHandler(
      request({ method: "POST", body: { text: "raced", url: "https://www.linkedin.com/feed/update/urn:li:activity:1/" } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });

  it("dedupes a repeated capture that has no url by urn", async () => {
    const insertCalls = () =>
      sql.mock.calls.filter((c) => sqlCallText(c).includes("INSERT INTO posts"));
    sql.mockImplementation(async (strings) => {
      const text = strings.join(" ");
      if (text.includes("INSERT INTO posts")) return [{ id: 9 }];
      if (text.includes("SELECT id FROM posts") && text.includes("urn =")) {
        // The second capture finds the row the first one inserted.
        return insertCalls().length ? [{ id: 9 }] : [];
      }
      return [];
    });
    getPost.mockResolvedValue({ id: 9, text: "Post with no permalink" });

    const body = { text: "Post with no permalink", urn: "urn:li:activity:999", url: null };
    const first = response();
    await postsHandler(request({ method: "POST", body }), first);
    expect(first.statusCode).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const second = response();
    await postsHandler(request({ method: "POST", body }), second);
    expect(second.statusCode).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(insertCalls()).toHaveLength(1);

    const urnLookup = sql.mock.calls.find((c) => sqlCallText(c).includes("urn ="));
    expect(sqlCallText(urnLookup)).toContain("user_id =");
    expect(sqlCallValues(urnLookup)).toEqual(["user_a", "urn:li:activity:999"]);
  });
});

describe("post detail API ownership", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({ userId: "user_a", kind: "web" });
    sql.mockResolvedValue([]);
  });

  it("404s for a post id the caller does not own", async () => {
    getPost.mockResolvedValue(null);
    const res = response();
    await postHandler(
      { ...request({ method: "DELETE" }), query: { id: "42" } },
      res
    );
    expect(res.statusCode).toBe(404);
    expect(getPost).toHaveBeenCalledWith("user_a", 42);
    expect(sql).not.toHaveBeenCalled();
  });

  it("scopes deletes by owner and id", async () => {
    getPost.mockResolvedValue({ id: 42 });
    const res = response();
    await postHandler(
      { ...request({ method: "DELETE" }), query: { id: "42" } },
      res
    );
    const del = sql.mock.calls.find((c) => sqlCallText(c).includes("DELETE FROM posts"));
    expect(sqlCallText(del)).toContain("user_id =");
    expect(sqlCallValues(del)).toEqual(["user_a", 42]);
  });

  it("refuses to write an unknown status value", async () => {
    getPost.mockResolvedValue({ id: 42 });
    const res = response();
    await postHandler(
      { ...request({ method: "PATCH", body: { status: "hacked" } }), query: { id: "42" } },
      res
    );
    const update = sql.mock.calls.find((c) => sqlCallText(c).includes("UPDATE posts"));
    expect(sqlCallValues(update)).not.toContain("hacked");
  });

  it("derives status from tags when the body sends an empty string", async () => {
    getPost.mockResolvedValue({ id: 42 });
    const res = response();
    await postHandler(
      { ...request({ method: "PATCH", body: { tags: ["x"], status: "" } }), query: { id: "42" } },
      res
    );
    expect(setPostTags).toHaveBeenCalledWith("user_a", 42, ["x"]);
    const update = sql.mock.calls.find((c) => sqlCallText(c).includes("UPDATE posts"));
    expect(sqlCallValues(update)).toContain("filed");
  });
});
