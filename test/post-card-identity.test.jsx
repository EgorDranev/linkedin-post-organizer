import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PostCard } from "../src/PostCard.jsx";

vi.mock("../src/api.js", () => ({
  api: { updatePost: vi.fn() },
}));

const post = {
  id: 1,
  url: "https://www.linkedin.com/posts/example",
  author: "Sahil Bloom",
  authorHeadline: "NYT Bestselling Author | Entrepreneur",
  text: "The best mental health hack is physical.",
  savedAt: "2026-07-21T10:00:00.000Z",
  tags: [],
  suggested: [],
  metadata: {},
  media: [],
};

describe("post card identity metadata", () => {
  it("renders headline and saved-date fallback without an empty separator", () => {
    const { container } = render(
      <PostCard
        post={post}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onTagClick={vi.fn()}
      />
    );

    expect(screen.getByText("NYT Bestselling Author | Entrepreneur")).toBeInTheDocument();
    expect(screen.getByText("Saved Jul 21 2026")).toBeInTheDocument();
    expect(container.querySelectorAll(".card-source .meta-sep")).toHaveLength(1);
  });
});
