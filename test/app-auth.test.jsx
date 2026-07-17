import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  getToken: vi.fn(),
  signOut: vi.fn(),
  signedIn: false,
}));

vi.mock("@clerk/react", () => ({
  Show: ({ children, when }) => {
    const activeBranch = clerk.signedIn ? "signed-in" : "signed-out";
    return when === activeBranch ? children : null;
  },
  SignIn: () => <div>Email sign in</div>,
  UserButton: () => <div>User account</div>,
  useAuth: () => ({
    getToken: clerk.getToken,
    isLoaded: true,
    signOut: clerk.signOut,
  }),
}));

import App from "../src/App.jsx";
import {
  api,
  AuthError,
  setTokenProvider,
  setUnauthorizedHandler,
} from "../src/api.js";

const response = (status, body = null) => ({
  status,
  ok: status >= 200 && status < 300,
  statusText: status === 401 ? "Unauthorized" : "OK",
  json: vi.fn().mockResolvedValue(body),
});

beforeEach(() => {
  clerk.signedIn = false;
  clerk.getToken.mockReset();
  clerk.signOut.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  setTokenProvider(null);
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe("account shell", () => {
  it("shows email sign in when there is no Clerk session", () => {
    render(<App />);
    expect(screen.getByText("Email sign in")).toBeInTheDocument();
  });

  it("loads the signed-in library with the Clerk bearer token", async () => {
    clerk.signedIn = true;
    clerk.getToken.mockResolvedValue("session-token");
    const fetchMock = vi.fn().mockResolvedValue(response(200, []));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.getByText("User account")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.get("Authorization")).toBe("Bearer session-token");
    }
  });

  it("signs out and shows session expiry when a library request is unauthorized", async () => {
    clerk.signedIn = true;
    clerk.getToken.mockResolvedValue("expired-token");
    clerk.signOut.mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));

    render(<App />);

    await waitFor(() => expect(clerk.signOut).toHaveBeenCalled());
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });

  it("invokes the unauthorized callback before a mutation throws AuthError", async () => {
    const events = [];
    setTokenProvider(() => Promise.resolve("expired-token"));
    setUnauthorizedHandler(() => events.push("unauthorized"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));

    await expect(api.deletePost("post-1")).rejects.toBeInstanceOf(AuthError);
    events.push("rejected");

    expect(events).toEqual(["unauthorized", "rejected"]);
  });
});
