import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Library } from "../src/App.jsx";

vi.mock("../src/api.js", () => ({
  api: { listPosts: vi.fn().mockResolvedValue([]) },
  setTokenProvider: vi.fn(),
}));

describe("beta library scope", () => {
  it("guides an empty account to install the extension", async () => {
    render(<Library accountButton={null} />);
    expect(await screen.findByText("Install Chrome extension")).toBeInTheDocument();
    expect(screen.queryByText("Collections")).not.toBeInTheDocument();
    expect(screen.queryByText("Import older saves")).not.toBeInTheDocument();
  });
});
