// DOM-fixture tests for extension/lib/extract.js — the capture paths that
// regressed on real LinkedIn builds: the viewer's own avatar/name leaking in
// from the comment composer, video caption text displacing commentary, missing
// video thumbnails, and digit-less "counts".
import { beforeAll, afterEach, describe, expect, it } from "vitest";

import "../extension/lib/extract.js";

const LIS = globalThis.LIS;

// jsdom reports 0×0 for every element; the extractor's size heuristics
// (author avatar ≈48px, social-proof reactors ≈24px, content images ≥150px)
// need real numbers. Elements opt into a size via data-w/data-h; everything
// else gets a "visible block" default.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    const width = Number(this.getAttribute?.("data-w")) || 300;
    const height = Number(this.getAttribute?.("data-h")) || 100;
    return {
      width,
      height,
      top: 10,
      left: 10,
      right: 10 + width,
      bottom: 10 + height,
      x: 10,
      y: 10,
    };
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html) {
  document.body.innerHTML = html;
  return document.body.firstElementChild;
}

const AVATAR = (href, src, alt, size) =>
  `<a href="${href}"><img data-w="${size}" data-h="${size}" src="${src}" alt="${alt}"></a>`;

describe("author and avatar never come from the comments block", () => {
  it("named-class post: author from actor block, comment text/links excluded", () => {
    const post = mount(`
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:7123456789012345678">
        <div class="update-components-actor">
          ${AVATAR("https://www.linkedin.com/in/jane-doe", "https://media.licdn.com/jane.jpg", "View Jane Doe’s profile", 48)}
          <span class="update-components-actor__title"><span aria-hidden="true">Jane Doe</span></span>
          <span class="update-components-actor__description">Founder @ Acme</span>
        </div>
        <div class="update-components-text"><span aria-hidden="true">Real commentary about infographics.</span></div>
        <div class="social-details-social-counts">
          <span class="social-details-social-counts__item">12 reactions</span>
        </div>
        <div class="comments-comments-list">
          <div class="comments-comment-item">
            ${AVATAR("https://www.linkedin.com/in/rando-commenter", "https://media.licdn.com/rando.jpg", "View Rando Commenter’s profile", 40)}
            <div dir="auto">A very long comment that goes on and on and is much longer than the post commentary itself, so a longest-text heuristic would wrongly pick it as the body of the post.</div>
          </div>
          <div class="comments-comment-box">
            ${AVATAR("https://www.linkedin.com/in/egor-dranev", "https://media.licdn.com/egor.jpg", "Egor Dranev", 40)}
            <div dir="auto">Add a comment…</div>
          </div>
        </div>
      </div>
    `);

    const captured = LIS.extract(post);
    expect(captured.author).toBe("Jane Doe");
    expect(captured.text).toBe("Real commentary about infographics.");
    expect(captured.metadata.authorImage).toBe("https://media.licdn.com/jane.jpg");
    expect(captured.metadata.authorProfileUrl).toBe("https://www.linkedin.com/in/jane-doe");
    expect(captured.metadata.socialCounts.reactions).toBe("12");
    const linkUrls = (captured.metadata.links || []).map((l) => l.url);
    expect(linkUrls.join(" ")).not.toMatch(/rando-commenter|egor-dranev/);
  });

  it("class-obfuscated post: header avatar wins over reactor above and composer below", () => {
    const post = mount(`
      <div data-urn="urn:li:activity:7123456789012345678">
        <div class="_ctx">${AVATAR("https://www.linkedin.com/in/reactor-rae", "https://media.licdn.com/rae.jpg", "View Reactor Rae’s profile", 24)}<span dir="auto">Reactor Rae loves this</span></div>
        <div class="_hdr">${AVATAR("https://www.linkedin.com/in/jane-doe", "https://media.licdn.com/jane.jpg", "View Jane Doe’s profile", 48)}</div>
        <div class="_body"><div dir="auto">Commentary written by the author, reasonably long.</div></div>
        <form class="_composer">
          ${AVATAR("https://www.linkedin.com/in/egor-dranev", "https://media.licdn.com/egor.jpg", "Egor Dranev", 48)}
          <div dir="auto">Add a comment to join the conversation…</div>
        </form>
      </div>
    `);

    const captured = LIS.extract(post);
    expect(captured.author).toBe("Jane Doe");
    expect(captured.metadata.authorImage).toBe("https://media.licdn.com/jane.jpg");
    expect(captured.text).toBe("Commentary written by the author, reasonably long.");
  });
});

describe("video posts", () => {
  it("commentary beats longer caption/transcript text inside the player section", () => {
    const post = mount(`
      <div data-urn="urn:li:activity:7123456789012345678">
        <div class="_body"><div dir="auto">Short real commentary for the video.</div></div>
        <div class="_player">
          <video poster="https://media.licdn.com/poster.jpg"></video>
          <div dir="auto">Swipe Left 01 The results 02 Go to gamma.app Click Step 1 04 Notepad style Step 2 Copy this prompt: an extremely long overlay transcript that dwarfs the commentary.</div>
        </div>
      </div>
    `);

    const captured = LIS.extract(post);
    expect(captured.text).toBe("Short real commentary for the video.");
    expect(captured.metadata.postType).toBe("video");
    const video = captured.media.find((item) => item.type === "video");
    expect(video?.thumbnailUrl).toBe("https://media.licdn.com/poster.jpg");
  });

  it("caption text still captured when the video post has no commentary", () => {
    const post = mount(`
      <div data-urn="urn:li:activity:7123456789012345678">
        <div class="_player">
          <video></video>
          <div dir="auto">Only the caption text exists on this post.</div>
        </div>
      </div>
    `);

    expect(LIS.extract(post).text).toBe("Only the caption text exists on this post.");
  });

  it("poster-less player falls back to the poster div's background image", () => {
    const post = mount(`
      <div data-urn="urn:li:activity:7123456789012345678">
        <div class="_player">
          <div class="_frame">
            <video></video>
            <div class="vjs-poster" style="background-image: url(&quot;https://media.licdn.com/frame.jpg&quot;);"></div>
          </div>
        </div>
      </div>
    `);

    const video = LIS.extract(post).media.find((item) => item.type === "video");
    expect(video?.thumbnailUrl).toBe("https://media.licdn.com/frame.jpg");
  });

  it("YouTube embed yields a playable link, a derived thumbnail, and a video type", () => {
    const post = mount(`
      <div data-urn="urn:li:activity:7123456789012345678">
        <div class="_body"><div dir="auto">Stop scrolling. Watch this talk.</div></div>
        <div class="_embed">
          <iframe data-w="500" data-h="280" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Don’t Build Agents, Build Skills Instead"></iframe>
        </div>
      </div>
    `);

    const captured = LIS.extract(post);
    expect(captured.metadata.postType).toBe("external_video");
    const video = captured.media.find((item) => item.type === "video");
    expect(video?.thumbnailUrl).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(video?.url).toContain("youtube.com");
  });

  it("a bare YouTube anchor is enough to classify and thumbnail the post", () => {
    const post = mount(`
      <div data-urn="urn:li:activity:7123456789012345678">
        <div class="_body"><div dir="auto">Sharing a talk worth watching today.</div></div>
        <a href="https://youtu.be/dQw4w9WgXcQ">Watch the talk on YouTube right now</a>
      </div>
    `);

    const captured = LIS.extract(post);
    expect(captured.metadata.postType).toBe("video");
    const video = captured.media.find((item) => item.type === "video");
    expect(video?.thumbnailUrl).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });
});

describe("social counts", () => {
  it("never captures a digit-less blob as a count", () => {
    const post = mount(`
      <div data-urn="urn:li:activity:7123456789012345678">
        <div class="_body"><div dir="auto">Commentary with no engagement yet.</div></div>
        <div class="social-details-social-counts">
          <span class="social-details-social-counts__item">·</span>
          <span class="social-details-social-counts__comments">.</span>
        </div>
      </div>
    `);

    const counts = LIS.extract(post).metadata.socialCounts || {};
    expect(counts.reactions).toBeUndefined();
    expect(counts.comments).toBeUndefined();
  });

  it("still reads real counts, including K/M suffixes", () => {
    const post = mount(`
      <div data-urn="urn:li:activity:7123456789012345678">
        <div class="_body"><div dir="auto">Commentary for an engaged post here.</div></div>
        <div class="social-details-social-counts">
          <span class="social-details-social-counts__item">1,204 reactions</span>
          <span class="social-details-social-counts__comments">56 comments</span>
        </div>
      </div>
    `);

    const counts = LIS.extract(post).metadata.socialCounts;
    expect(counts.reactions).toBe("1,204");
    expect(counts.comments).toBe("56");
  });
});
