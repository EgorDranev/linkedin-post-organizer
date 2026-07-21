import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

describe("post card layout", () => {
  it("uses the approved focused column and compact card spacing", () => {
    expect(css).toMatch(/--card-max:\s*720px/);
    expect(css).toMatch(/\.section\s*\{[^}]*max-width:\s*var\(--card-max\)/s);
    expect(css).toMatch(/\.card-content\s*\{[^}]*padding:\s*var\(--space-4\)/s);
  });

  it("contains captured media in a 16:9 preview without cropping", () => {
    const mediaFrameRule = css.match(/\.card-media-frame\s*\{([^}]*)\}/s)?.[1] || "";
    const mediaImageRule = css.match(/\.card-media-frame img\s*\{([^}]*)\}/s)?.[1] || "";

    expect(mediaFrameRule).toContain("aspect-ratio: 16 / 9");
    expect(mediaFrameRule).toContain("overflow: hidden");
    expect(mediaFrameRule).toContain("display: grid");
    expect(mediaFrameRule).toContain("place-items: center");
    expect(mediaImageRule).toContain("position: absolute");
    expect(mediaImageRule).toContain("inset: 0");
    expect(mediaImageRule).toContain("width: 100%");
    expect(mediaImageRule).toContain("height: 100%");
    expect(mediaImageRule).toContain("object-fit: contain");
    expect(mediaImageRule).not.toContain("height: auto");
  });

  it("keeps identity metadata compact while preserving the date", () => {
    expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.card-id\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*40px minmax\(0, 1fr\) auto[^}]*grid-template-rows:\s*auto auto auto/s);
    expect(css).toMatch(/\.card-avatar\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/s);
    expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.card-id-main\s*\{[^}]*display:\s*contents/s);
    expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.card-headline-row\s*\{[^}]*grid-column:\s*2 \/ 4[^}]*grid-row:\s*2/s);
    expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.card-source\s*\{[^}]*grid-column:\s*2 \/ 4[^}]*grid-row:\s*3/s);
    expect(css).toMatch(/\.card-headline-row\s*\{[^}]*min-width:\s*0[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/\.card-source-time\s*\{[^}]*flex:\s*0 0 auto[^}]*white-space:\s*nowrap/s);
  });
});
