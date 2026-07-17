import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Library } from "../src/App.jsx";

vi.mock("../src/api.js", () => ({
  api: { listPosts: vi.fn().mockResolvedValue([]) },
  setTokenProvider: vi.fn(),
}));

describe("beta library scope", () => {
  it("guides an empty account to install the extension", async () => {
    import.meta.env.VITE_CHROME_STORE_URL = "https://chromewebstore.google.com/detail/test";
    try {
      render(<Library accountButton={null} />);
      expect(await screen.findByText("Install Chrome extension")).toBeInTheDocument();
      expect(screen.queryByText("Collections")).not.toBeInTheDocument();
      expect(screen.queryByText("Import older saves")).not.toBeInTheDocument();
    } finally {
      delete import.meta.env.VITE_CHROME_STORE_URL;
    }
  });

  it("does not render a dead install link before the Store URL exists", async () => {
    render(<Library accountButton={null} />);
    expect(
      await screen.findByText(/beta invite includes the extension install link/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Install Chrome extension")).not.toBeInTheDocument();
  });
});
