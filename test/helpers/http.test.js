import { describe, expect, it } from "vitest";
import { response } from "./http.js";

describe("HTTP response double", () => {
  it("supports chaining response methods", () => {
    const res = response()
      .setHeader("Content-Type", "application/json")
      .status(201)
      .json({ ok: true });

    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});
