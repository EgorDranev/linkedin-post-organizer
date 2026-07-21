import { describe, expect, it } from "vitest";
import {
  postCardAuthorAction,
  postCardConnectionDegree,
  postCardDate,
  postCardIsPublic,
} from "../src/postCardMetadata.js";

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

  it("accepts bounded identity metadata", () => {
    const post = {
      metadata: {
        connectionDegree: "2nd",
        authorAction: { text: "Visit my website", url: "https://example.com" },
        visibility: "public",
      },
    };

    expect(postCardConnectionDegree(post)).toBe("2nd");
    expect(postCardAuthorAction(post)).toEqual({
      text: "Visit my website",
      url: "https://example.com/",
    });
    expect(postCardIsPublic(post)).toBe(true);
  });

  it("rejects malformed identity metadata", () => {
    const post = {
      metadata: {
        connectionDegree: "friend",
        authorAction: { text: "Open", url: "javascript:alert(1)" },
        visibility: "connections",
      },
    };

    expect(postCardConnectionDegree(post)).toBe("");
    expect(postCardAuthorAction(post)).toBeNull();
    expect(postCardIsPublic(post)).toBe(false);
  });
});
