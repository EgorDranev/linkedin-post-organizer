import { describe, expect, it } from "vitest";
import { postCardDate } from "../src/postCardMetadata.js";

describe("post card date metadata", () => {
  it("prefers the exact publication date over captured relative text", () => {
    expect(
      postCardDate({
        savedAt: "2026-07-21T10:00:00.000Z",
        metadata: {
          publishedDate: "2026-07-19T10:00:00.000Z",
          publishedText: "2d",
        },
      })
    ).toEqual({ text: "Jul 19 2026", title: "Published Jul 19 2026" });
  });

  it("uses captured publication text when the exact date is unavailable", () => {
    expect(
      postCardDate({
        savedAt: "2026-07-21T10:00:00.000Z",
        metadata: { publishedDate: "invalid", publishedText: "2d" },
      })
    ).toEqual({ text: "2d", title: "Published 2d" });
  });

  it("falls back to the saved date", () => {
    expect(
      postCardDate({ savedAt: "2026-07-21T10:00:00.000Z", metadata: {} })
    ).toEqual({ text: "Saved Jul 21 2026", title: "Saved Jul 21 2026" });
  });

  it("omits invalid empty metadata", () => {
    expect(
      postCardDate({ savedAt: "invalid", metadata: { publishedText: "  " } })
    ).toBeNull();
  });
});
