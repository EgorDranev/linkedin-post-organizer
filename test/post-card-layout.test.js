import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

describe("post card layout", () => {
  it("uses the approved focused column and compact card spacing", () => {
    expect(css).toMatch(/--card-max:\s*720px/);
    expect(css).toMatch(/\.section\s*\{[^}]*max-width:\s*var\(--card-max\)/s);
    expect(css).toMatch(/\.card-content\s*\{[^}]*padding:\s*var\(--space-4\)/s);
  });

  it("lets captured media use its natural aspect ratio", () => {
    const mediaImageRule = css.match(/\.card-media-frame img\s*\{([^}]*)\}/s)?.[1] || "";
    expect(mediaImageRule).toContain("height: auto");
    expect(mediaImageRule).not.toContain("max-height: 480px");
    expect(mediaImageRule).not.toContain("aspect-ratio: auto 16 / 9");
  });
});
