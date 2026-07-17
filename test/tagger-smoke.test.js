import { describe, expect, it } from "vitest";
import { suggestTags } from "../api/_lib/tagger.js";

describe("offline tagger", () => {
  it("keeps working without an AI key", () => {
    const tags = suggestTags("A practical guide to #CustomerResearch", []);
    expect(tags.map((item) => item.tag)).toContain("customer research");
  });
});
