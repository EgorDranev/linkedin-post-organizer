import { describe, expect, it } from "vitest";
import { createRepository } from "../api/_lib/db.js";

function fakeSql(rows = []) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return rows;
  };
  sql.calls = calls;
  return sql;
}

describe("owned repository", () => {
  it("scopes post lookup to both user and post id", async () => {
    const sql = fakeSql([]);
    const repo = createRepository(sql);
    await repo.getPost("user_a", 42);
    expect(sql.calls[0].text).toContain("user_id =");
    expect(sql.calls[0].values).toEqual(expect.arrayContaining(["user_a", 42]));
  });

  it("scopes tag vocabulary to one user", async () => {
    const sql = fakeSql([]);
    const repo = createRepository(sql);
    await repo.allTags("user_b");
    expect(sql.calls[0].text).toContain("t.user_id =");
    expect(sql.calls[0].values).toContain("user_b");
  });
});
