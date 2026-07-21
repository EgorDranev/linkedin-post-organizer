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
    expect(container.querySelectorAll(".card-source .meta-sep")).toHaveLength(0);
  });

  it("renders the complete LinkedIn identity hierarchy", () => {
    const completePost = {
      ...post,
      author: "Harvey Knight",
      authorHeadline:
        "Founder | Investor | Helping Family Offices & HNWIs Access Private Markets",
      metadata: {
        connectionDegree: "2nd",
        authorAction: {
          text: "Visit my website",
          url: "https://harvey.example.com",
        },
        publishedText: "6h",
        visibility: "public",
      },
    };

    render(
      <PostCard
        post={completePost}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onTagClick={vi.fn()}
      />
    );

    expect(screen.getByText("Harvey Knight")).toBeInTheDocument();
    expect(screen.getByText("2nd")).toBeInTheDocument();
    expect(screen.getByText(completePost.authorHeadline)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visit my website" })).toHaveAttribute(
      "href",
      "https://harvey.example.com/"
    );
    expect(screen.getByText("6h")).toBeInTheDocument();
    expect(screen.getByLabelText("Public post")).toBeInTheDocument();
  });
});
