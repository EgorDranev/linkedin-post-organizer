import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/react", () => ({
  Show: ({ children, when }) => when === "signed-out" ? children : null,
  SignIn: () => <div>Email sign in</div>,
  UserButton: () => null,
  useAuth: () => ({ getToken: vi.fn(), isLoaded: true }),
}));

import App from "../src/App.jsx";

describe("account shell", () => {
  it("shows email sign in when there is no Clerk session", () => {
    render(<App />);
    expect(screen.getByText("Email sign in")).toBeInTheDocument();
  });
});
