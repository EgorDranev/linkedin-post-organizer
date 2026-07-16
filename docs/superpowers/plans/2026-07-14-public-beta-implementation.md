# Public Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current single-workspace LinkedIn Saver into an invite-only hosted beta with Clerk email-link accounts, private per-user data, secure Chrome-extension pairing, and an unlisted Chrome Web Store release package.

**Architecture:** Keep the Vite/React frontend, Vercel serverless handlers, Neon Postgres, capture extractor, and offline tagger. Clerk supplies passwordless web identity; every application query is scoped by the verified Clerk user id. The extension uses a separate revocable bearer token obtained through a short-lived verifier-based pairing flow, so it never stores the user's Clerk session.

**Tech Stack:** React 18, Vite 5, Clerk React/Backend SDKs, Vercel Node functions, Neon Postgres, Chrome Manifest V3, Vitest, Testing Library, jsdom.

---

## Locked implementation decisions

- Use Clerk prebuilt sign-in UI configured for email verification links only.
- Configure Clerk production as restricted/invite-only; do not build a second invite database.
- Send an explicit Clerk bearer token from the React app to the API. Do not depend on forwarding Clerk cookies through custom Vercel handlers.
- Use `user_id = Clerk user.id` as the ownership key. Do not duplicate profiles unless product data later requires it.
- Pair the extension with a verifier flow: the extension creates a short-lived request, opens the hosted approval page, polls, and redeems once for a long-lived random token. Persist only SHA-256 hashes of verifiers and tokens.
- Keep the installed extension's app origin fixed to `https://linkedin-saver.vercel.app`; self-hosters change `extension/config.js` before packaging.
- Retain old collection tables only for safe migration. Remove collection routes and UI from the beta surface.
- Keep offline tag suggestions and CSV export. Remove backlog import and AI export/theme features from the beta path.

## File map

### Create

- `vitest.config.js` — shared jsdom/unit-test configuration.
- `test/setup.js` — Testing Library matchers and test cleanup.
- `test/helpers/http.js` — minimal Vercel request/response doubles.
- `test/auth.test.js` — Clerk and extension bearer authentication.
- `test/posts-api.test.js` — handler ownership and duplicate behavior.
- `test/account-api.test.js` — deletion and token invalidation.
- `test/pairing-api.test.js` — create/approve/redeem/revoke lifecycle.
- `test/app-auth.test.jsx` — signed-out and signed-in frontend states.
- `test/extension-pairing.test.js` — verifier encoding and popup pairing state.
- `scripts/migrate-multi-account.mjs` — idempotent production data migration.
- `api/account.js` — delete the current user's data and Clerk identity.
- `api/extension/pairings.js` — create an unauthenticated short-lived pairing request.
- `api/extension/pairings/[id].js` — approve a request as the signed-in web user.
- `api/extension/pairings/[id]/redeem.js` — redeem an approved request once.
- `api/extension/tokens.js` — list the current user's connected extensions.
- `api/extension/tokens/[id].js` — revoke one current-user extension token.
- `src/AuthScreen.jsx` — focused Clerk sign-in surface.
- `src/ExtensionConnect.jsx` — signed-in pairing approval page.
- `src/Settings.jsx` — connected-extension list and account deletion.
- `extension/config.js` — one fixed hosted origin.
- `extension/lib/pairing-core.js` — pure verifier/token helpers shared by popup logic and tests.
- `PRIVACY.md` — user-data disclosure, retention, export, and deletion policy.
- `SECURITY.md` — private vulnerability-reporting channel and response expectations.
- `CONTRIBUTING.md` — local setup, test, and extension packaging workflow.
- `docs/chrome-web-store-checklist.md` — unlisted release assets and dashboard fields.

### Modify

- `package.json`, `package-lock.json` — Clerk and test dependencies/scripts.
- `.env.example` — Clerk keys, authorized origin, and migration owner id.
- `src/main.jsx` — mount `ClerkProvider`.
- `src/App.jsx` — Clerk state, library routes, empty-state install CTA, and settings.
- `src/api.js` — authenticated request wrapper and new pairing/account methods.
- `src/PostCard.jsx` — remove collection behavior.
- `src/styles.css` — auth, connection, settings, and simplified layout styles.
- `api/_lib/auth.js` — verify Clerk or extension bearer credentials.
- `api/_lib/db.js` — owner-scoped schema and repository operations.
- `api/posts.js`, `api/posts/[id].js`, `api/posts/[id]/resuggest.js`, `api/tags.js` — pass verified `userId` through every operation.
- `extension/manifest.json` — minimum permissions and exact hosted origin.
- `extension/background.js` — extension token auth and pairing messages.
- `extension/popup.html`, `extension/popup.js` — consent, connect, connected, and reconnect states.
- `extension/lib/save.js` — account-aware error copy.
- `README.md` — hosted beta first, contributor setup second.

### Delete

- `src/Login.jsx`
- `src/CollectionSidebar.jsx`
- `api/login.js`
- `api/logout.js`
- `api/session.js`
- `api/collections.js`
- `api/collections/[id].js`
- `api/collections/[id]/posts.js`
- `api/post-collection.js`
- `extension/saved-import.js`

## Task 1: Establish the test harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.js`
- Create: `test/setup.js`
- Create: `test/helpers/http.js`
- Create: `test/tagger-smoke.test.js`

- [x] **Step 1: Install the test dependencies**

Run:

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

Expected: `package.json` and `package-lock.json` include the four development dependencies.

- [x] **Step 2: Add test scripts**

Add these scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [x] **Step 3: Create the Vitest configuration and setup**

Create `vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.js"],
    clearMocks: true,
  },
});
```

Create `test/setup.js`:

```js
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

Create `test/helpers/http.js`:

```js
export function request({ method = "GET", headers = {}, body, query = {} } = {}) {
  return { method, headers, body, query, url: "http://localhost/api/test" };
}

export function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}
```

- [x] **Step 4: Add and run a baseline smoke test**

Create `test/tagger-smoke.test.js`:

```js
import { describe, expect, it } from "vitest";
import { suggestTags } from "../api/_lib/tagger.js";

describe("offline tagger", () => {
  it("keeps working without an AI key", () => {
    const tags = suggestTags("A practical guide to #CustomerResearch", []);
    expect(tags.map((item) => item.tag)).toContain("customer research");
  });
});
```

Run: `npm test`

Expected: one passing test and no unhandled errors.

- [x] **Step 5: Commit the test foundation**

```bash
git add package.json package-lock.json vitest.config.js test
git commit -m "test: add beta test harness"
```

## Task 2: Add Clerk email-link authentication to the web app

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `src/main.jsx`
- Modify: `src/App.jsx`
- Modify: `src/api.js`
- Create: `src/AuthScreen.jsx`
- Create: `test/app-auth.test.jsx`
- Delete: `src/Login.jsx`

- [x] **Step 1: Install Clerk's React and backend SDKs**

Run:

```bash
npm install @clerk/react @clerk/backend
```

Expected: both packages appear under `dependencies`.

- [x] **Step 2: Document the required environment**

Append to `.env.example`:

```dotenv
# Clerk application configured with email verification links only.
VITE_CLERK_PUBLISHABLE_KEY=pk_test_linkedin_saver_local
CLERK_PUBLISHABLE_KEY=pk_test_linkedin_saver_local
CLERK_SECRET_KEY=sk_test_linkedin_saver_local
APP_ORIGIN=http://localhost:3000

# Clerk user id that receives records from the pre-account database migration.
FOUNDER_USER_ID=user_founder
```

The README task later explains that real keys come from the Clerk dashboard and must stay in `.env.local`/Vercel, never in Git.

- [x] **Step 3: Write the signed-out frontend test first**

Create `test/app-auth.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/react", () => ({
  SignedIn: () => null,
  SignedOut: ({ children }) => children,
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
```

Run: `npm test -- test/app-auth.test.jsx`

Expected: FAIL because the current app still renders the shared-password login.

- [x] **Step 4: Mount Clerk and replace the password gate**

Replace `src/main.jsx` with:

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import "./styles.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
```

Create `src/AuthScreen.jsx`:

```jsx
import { SignIn } from "@clerk/react";

export function AuthScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-copy">
        <span className="brand-mark">in</span>
        <h1>Your saved posts, finally findable.</h1>
        <p>Enter your email and we'll send a secure sign-in link.</p>
      </section>
      <SignIn routing="hash" signUpUrl="#" />
    </main>
  );
}
```

Wrap the existing library JSX in a `Library` component and make `App` return:

```jsx
import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/react";
import { AuthScreen } from "./AuthScreen.jsx";
import { setTokenProvider } from "./api.js";

export default function App() {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    setTokenProvider(getToken);
    return () => setTokenProvider(null);
  }, [getToken]);

  if (!isLoaded) return <div className="app" aria-label="Loading account" />;
  return (
    <>
      <SignedOut><AuthScreen /></SignedOut>
      <SignedIn><Library accountButton={<UserButton />} /></SignedIn>
    </>
  );
}
```

Remove the old `authed`, `/api/session`, login, logout, and `Login` component paths from `App.jsx`. Place `accountButton` where the Lock button currently renders.

- [x] **Step 5: Attach Clerk tokens to all web API calls**

At the top of `src/api.js`, replace the singleton fetch assumptions with:

```js
let tokenProvider = null;

export function setTokenProvider(provider) {
  tokenProvider = provider;
}

async function request(path, init = {}) {
  const token = tokenProvider ? await tokenProvider() : null;
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  return json(response);
}
```

Change every method in `api` to call `request`, for example:

```js
listPosts: () => request("/api/posts"),
savePost: (body) => request("/api/posts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}),
```

Remove `session`, `login`, and `logout` from the API object.

- [x] **Step 6: Run tests and build**

Run:

```bash
npm test -- test/app-auth.test.jsx
npm run build
```

Expected: the auth test passes and Vite completes without missing imports.

- [x] **Step 7: Delete the shared-password frontend and commit**

```bash
git rm src/Login.jsx
git add package.json package-lock.json .env.example src/main.jsx src/App.jsx src/api.js src/AuthScreen.jsx test/app-auth.test.jsx
git commit -m "feat: add email-link account shell"
```

## Task 3: Replace shared-password API auth with verified identities

**Files:**
- Modify: `api/_lib/auth.js`
- Create: `test/auth.test.js`
- Delete: `api/login.js`
- Delete: `api/logout.js`
- Delete: `api/session.js`

- [ ] **Step 1: Write failing Clerk bearer tests**

Create `test/auth.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyToken, findExtensionToken } = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  findExtensionToken: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({ verifyToken }));
vi.mock("../api/_lib/db.js", () => ({
  findExtensionToken,
}));

import { authenticateRequest } from "../api/_lib/auth.js";

describe("authenticateRequest", () => {
  beforeEach(() => {
    process.env.CLERK_SECRET_KEY = "sk_test";
    process.env.APP_ORIGIN = "https://linkedin-saver.vercel.app";
  });

  it("returns the Clerk subject for a valid web token", async () => {
    verifyToken.mockResolvedValue({ sub: "user_a" });
    const actor = await authenticateRequest({
      headers: { authorization: "Bearer clerk_session" },
    });
    expect(actor).toEqual({ userId: "user_a", kind: "web" });
  });

  it("returns the token owner for an active extension token", async () => {
    findExtensionToken.mockResolvedValue({ userId: "user_b", id: "token_1" });
    const actor = await authenticateRequest({
      headers: { authorization: "Bearer lis_ext_secret" },
    });
    expect(actor).toEqual({ userId: "user_b", kind: "extension", tokenId: "token_1" });
  });

  it("rejects a missing bearer token", async () => {
    await expect(authenticateRequest({ headers: {} })).rejects.toMatchObject({ statusCode: 401 });
  });
});
```

Run: `npm test -- test/auth.test.js`

Expected: FAIL because `authenticateRequest` does not exist.

- [ ] **Step 2: Implement a two-actor authentication boundary**

Replace `api/_lib/auth.js` with:

```js
import crypto from "node:crypto";
import { verifyToken } from "@clerk/backend";
import { findExtensionToken } from "./db.js";

class HttpAuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function hashSecret(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function bearer(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
}

export async function authenticateRequest(req) {
  const token = bearer(req);
  if (!token) throw new HttpAuthError("unauthorized");

  if (token.startsWith("lis_ext_")) {
    const record = await findExtensionToken(hashSecret(token));
    if (!record) throw new HttpAuthError("extension token is invalid or revoked");
    return { userId: record.userId, kind: "extension", tokenId: record.id };
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: [process.env.APP_ORIGIN].filter(Boolean),
    });
    if (!payload.sub) throw new Error("missing subject");
    return { userId: payload.sub, kind: "web" };
  } catch {
    throw new HttpAuthError("unauthorized");
  }
}

export async function requireUser(req, res, { webOnly = false } = {}) {
  try {
    const actor = await authenticateRequest(req);
    if (webOnly && actor.kind !== "web") throw new HttpAuthError("web session required", 403);
    return actor;
  } catch (error) {
    res.status(error.statusCode || 401).json({ error: error.message || "unauthorized" });
    return null;
  }
}
```

- [ ] **Step 3: Run the auth tests**

Run: `npm test -- test/auth.test.js`

Expected: all three tests pass.

- [ ] **Step 4: Remove obsolete handlers and commit**

```bash
git rm api/login.js api/logout.js api/session.js
git add api/_lib/auth.js test/auth.test.js
git commit -m "feat: verify web and extension identities"
```

## Task 4: Migrate the database to strict per-user ownership

**Files:**
- Create: `scripts/migrate-multi-account.mjs`
- Modify: `api/_lib/db.js`
- Modify: `package.json`
- Create: `test/db-ownership.test.js`

- [ ] **Step 1: Write the repository contract test**

Create `test/db-ownership.test.js` with a tagged-template recorder and assertions that owner ids are present in every operation:

```js
import { describe, expect, it } from "vitest";
import { createRepository } from "../api/_lib/db.js";

function fakeSql(rows = []) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return rows;
  };
  sql.calls = calls;
  return sql;
}

describe("owned repository", () => {
  it("scopes post lookup to both user and post id", async () => {
    const sql = fakeSql([]);
    const repo = createRepository(sql);
    await repo.getPost("user_a", 42);
    expect(sql.calls[0].text).toContain("user_id =");
    expect(sql.calls[0].values).toEqual(expect.arrayContaining(["user_a", 42]));
  });

  it("scopes tag vocabulary to one user", async () => {
    const sql = fakeSql([]);
    const repo = createRepository(sql);
    await repo.allTags("user_b");
    expect(sql.calls[0].text).toContain("t.user_id =");
    expect(sql.calls[0].values).toContain("user_b");
  });
});
```

Run: `npm test -- test/db-ownership.test.js`

Expected: FAIL because `createRepository` does not exist.

- [ ] **Step 2: Add the idempotent migration script**

Create `scripts/migrate-multi-account.mjs`. It must:

```js
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const founderUserId = process.env.FOUNDER_USER_ID;
if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required");

const sql = neon(connectionString);
await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`ALTER TABLE tags ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`ALTER TABLE post_tags ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`ALTER TABLE post_collections ADD COLUMN IF NOT EXISTS user_id TEXT`;

const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM posts WHERE user_id IS NULL`;
if (count > 0 && !founderUserId) {
  throw new Error("FOUNDER_USER_ID is required while unowned posts exist");
}
if (founderUserId) {
  await sql`UPDATE posts SET user_id = ${founderUserId} WHERE user_id IS NULL`;
  await sql`UPDATE tags SET user_id = ${founderUserId} WHERE user_id IS NULL`;
  await sql`UPDATE collections SET user_id = ${founderUserId} WHERE user_id IS NULL`;
  await sql`UPDATE post_tags pt SET user_id = p.user_id FROM posts p WHERE pt.post_id = p.id AND pt.user_id IS NULL`;
  await sql`UPDATE post_collections pc SET user_id = p.user_id FROM posts p WHERE pc.post_id = p.id AND pc.user_id IS NULL`;
}

await sql`ALTER TABLE posts ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE tags ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE post_tags ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE collections ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE post_collections ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_url_key`;
await sql`ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key`;
await sql`ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_name_key`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS posts_user_url_unique ON posts (user_id, url) WHERE url IS NOT NULL`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_unique ON tags (user_id, name)`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS collections_user_name_unique ON collections (user_id, name)`;
```

Finish the script by creating `extension_pairings` and `extension_tokens` using the exact columns defined in Task 7, then print `Multi-account migration complete`.

Add to `package.json`:

```json
"migrate:multi-account": "node scripts/migrate-multi-account.mjs"
```

- [ ] **Step 3: Refactor `db.js` behind an owner-aware repository**

Export `createRepository(db)` and instantiate it with the existing Neon `sql`. The public function signatures must be:

```js
export function createRepository(db) {
  async function tagsForPost(userId, postId) {
    const rows = await db`
      SELECT t.name FROM post_tags pt
      JOIN tags t ON t.id = pt.tag_id AND t.user_id = ${userId}
      WHERE pt.user_id = ${userId} AND pt.post_id = ${postId}
      ORDER BY t.name`;
    return rows.map((row) => row.name);
  }

  async function getPost(userId, id) {
    const rows = await db`SELECT * FROM posts WHERE user_id = ${userId} AND id = ${id}`;
    return rows.length ? hydrate(userId, rows[0]) : null;
  }

  async function allTags(userId) {
    return db`
      SELECT t.name, COUNT(pt.post_id)::int AS count
      FROM tags t
      LEFT JOIN post_tags pt ON pt.tag_id = t.id AND pt.user_id = ${userId}
      WHERE t.user_id = ${userId}
      GROUP BY t.id ORDER BY count DESC, t.name ASC`;
  }

  async function upsertTag(userId, name) {
    const clean = name.trim().toLowerCase();
    const rows = await db`
      INSERT INTO tags (user_id, name) VALUES (${userId}, ${clean})
      ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id`;
    return rows[0].id;
  }

  async function setPostTags(userId, postId, names) {
    await db`DELETE FROM post_tags WHERE user_id = ${userId} AND post_id = ${postId}`;
    for (const name of names) {
      if (!name?.trim()) continue;
      const tagId = await upsertTag(userId, name);
      await db`
        INSERT INTO post_tags (user_id, post_id, tag_id)
        VALUES (${userId}, ${postId}, ${tagId}) ON CONFLICT DO NOTHING`;
    }
  }

  async function hydrate(userId, row) {
    return {
      id: Number(row.id), url: row.url, author: row.author,
      authorHeadline: row.author_headline, text: row.text,
      savedAt: row.saved_at, status: row.status,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      media: Array.isArray(row.media) ? row.media : [],
      tags: await tagsForPost(userId, row.id),
      suggested: Array.isArray(row.suggested) ? row.suggested : [],
    };
  }

  return { allTags, getPost, hydrate, setPostTags, tagsForPost, upsertTag };
}
```

Add owner-aware token/pairing methods in Task 7. Remove collection repository methods from exports. Re-export the default repository methods for the handlers:

```js
const repository = createRepository(sql);
export const { allTags, getPost, hydrate, setPostTags, tagsForPost, upsertTag } = repository;
```

Update `ensureSchema()` so fresh tables include `user_id TEXT NOT NULL`, per-user unique indexes, and the extension tables. Existing databases still require the migration command before deployment.

- [ ] **Step 4: Run ownership tests**

Run: `npm test -- test/db-ownership.test.js`

Expected: both ownership assertions pass.

- [ ] **Step 5: Commit the migration and repository boundary**

```bash
git add package.json api/_lib/db.js scripts/migrate-multi-account.mjs test/db-ownership.test.js
git commit -m "feat: add per-user data ownership"
```

## Task 5: Enforce ownership in every remaining content API

**Files:**
- Modify: `api/posts.js`
- Modify: `api/posts/[id].js`
- Modify: `api/posts/[id]/resuggest.js`
- Modify: `api/tags.js`
- Create: `test/posts-api.test.js`

- [ ] **Step 1: Write handler isolation tests**

Create `test/posts-api.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { request, response } from "./helpers/http.js";

const { requireUser, sql, hydrate } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sql: vi.fn(),
  hydrate: vi.fn(),
}));
vi.mock("../api/_lib/auth.js", () => ({ requireUser }));
vi.mock("../api/_lib/db.js", () => ({
  ensureSchema: vi.fn(), hasDatabase: true, sql, hydrate,
  allTags: vi.fn().mockResolvedValue([]), getPost: vi.fn(),
}));
vi.mock("../api/_lib/ai.js", () => ({ suggestTagsAI: vi.fn().mockResolvedValue([]) }));

import postsHandler from "../api/posts.js";

describe("posts API ownership", () => {
  beforeEach(() => requireUser.mockResolvedValue({ userId: "user_a", kind: "web" }));

  it("passes the owner to hydration for list responses", async () => {
    sql.mockResolvedValue([{ id: 1, user_id: "user_a" }]);
    hydrate.mockResolvedValue({ id: 1 });
    const res = response();
    await postsHandler(request(), res);
    expect(hydrate).toHaveBeenCalledWith("user_a", expect.objectContaining({ id: 1 }));
  });

  it("does not continue when authentication fails", async () => {
    requireUser.mockImplementation(async (_req, res) => {
      res.status(401).json({ error: "unauthorized" });
      return null;
    });
    const res = response();
    await postsHandler(request(), res);
    expect(res.statusCode).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -- test/posts-api.test.js`

Expected: FAIL because the current handler calls synchronous `requireAuth` and unscoped `hydrate`.

- [ ] **Step 2: Scope the collection endpoint**

At the start of `api/posts.js`:

```js
const actor = await requireUser(req, res);
if (!actor) return;
const { userId } = actor;
```

Change the GET query and hydration to:

```js
const rows = await sql`
  SELECT * FROM posts WHERE user_id = ${userId}
  ORDER BY saved_at DESC, id DESC`;
const posts = await Promise.all(rows.map((row) => hydrate(userId, row)));
```

Change POST vocabulary, duplicate lookup, updates, insert, and final hydration to use `userId`:

```js
const tags = await allTags(userId);
const existing = postUrl
  ? await sql`SELECT id FROM posts WHERE user_id = ${userId} AND url = ${postUrl}`
  : [];
```

The insert must include `user_id`; every update must include `WHERE user_id = ${userId} AND id = ${id}`; every `getPost` call becomes `getPost(userId, id)`. Remove collection-association code from this handler.

- [ ] **Step 3: Scope item, resuggest, and tag handlers**

In each handler, await `requireUser`, stop on null, and pass `userId` to repository functions. The item mutation shape must be:

```js
const post = await getPost(userId, id);
if (!post) return res.status(404).json({ error: "not found" });

if (req.method === "PATCH") {
  const { tags, suggested, status } = req.body || {};
  if (Array.isArray(tags)) await setPostTags(userId, id, tags);
  await sql`
    UPDATE posts SET
      suggested = COALESCE(${suggested ? JSON.stringify(suggested) : null}::jsonb, suggested),
      status = COALESCE(${status ?? null}, status)
    WHERE user_id = ${userId} AND id = ${id}`;
  return res.status(200).json(await getPost(userId, id));
}

if (req.method === "DELETE") {
  await sql`DELETE FROM posts WHERE user_id = ${userId} AND id = ${id}`;
  return res.status(204).end();
}
```

`api/tags.js` must return `allTags(userId)`. `resuggest.js` must read/update with both `userId` and `id`.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
npm test -- test/posts-api.test.js test/auth.test.js test/db-ownership.test.js
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit content isolation**

```bash
git add api/posts.js api/posts/[id].js api/posts/[id]/resuggest.js api/tags.js test/posts-api.test.js
git commit -m "feat: isolate every library by account"
```

## Task 6: Add account settings and complete deletion

**Files:**
- Create: `api/account.js`
- Create: `src/Settings.jsx`
- Modify: `src/App.jsx`
- Modify: `src/api.js`
- Modify: `src/styles.css`
- Create: `test/account-api.test.js`

- [ ] **Step 1: Write the deletion test**

Create `test/account-api.test.js`:

```js
import { describe, expect, it, vi } from "vitest";
import { request, response } from "./helpers/http.js";

const { requireUser, deleteUserData, deleteUser } = vi.hoisted(() => ({
  requireUser: vi.fn().mockResolvedValue({ userId: "user_a", kind: "web" }),
  deleteUserData: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("../api/_lib/auth.js", () => ({ requireUser }));
vi.mock("../api/_lib/db.js", () => ({ deleteUserData }));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { deleteUser } }),
}));

import handler from "../api/account.js";

describe("DELETE /api/account", () => {
  it("deletes owned data before deleting the identity", async () => {
    const res = response();
    await handler(request({ method: "DELETE" }), res);
    expect(deleteUserData).toHaveBeenCalledWith("user_a");
    expect(deleteUser).toHaveBeenCalledWith("user_a");
    expect(res.statusCode).toBe(204);
  });
});
```

Run: `npm test -- test/account-api.test.js`

Expected: FAIL because the handler does not exist.

- [ ] **Step 2: Add ordered user-data deletion**

Add `deleteUserData(userId)` to `db.js`. Delete in dependency order and always scope by owner:

```js
export async function deleteUserData(userId) {
  await sql`DELETE FROM extension_pairings WHERE user_id = ${userId}`;
  await sql`DELETE FROM extension_tokens WHERE user_id = ${userId}`;
  await sql`DELETE FROM post_collections WHERE user_id = ${userId}`;
  await sql`DELETE FROM post_tags WHERE user_id = ${userId}`;
  await sql`DELETE FROM collections WHERE user_id = ${userId}`;
  await sql`DELETE FROM tags WHERE user_id = ${userId}`;
  await sql`DELETE FROM posts WHERE user_id = ${userId}`;
}
```

Create `api/account.js`:

```js
import { createClerkClient } from "@clerk/backend";
import { requireUser } from "./_lib/auth.js";
import { deleteUserData } from "./_lib/db.js";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "method not allowed" });
  }
  const actor = await requireUser(req, res, { webOnly: true });
  if (!actor) return;
  await deleteUserData(actor.userId);
  await clerk.users.deleteUser(actor.userId);
  return res.status(204).end();
}
```

- [ ] **Step 3: Add Settings UI and API method**

Add to `src/api.js`:

```js
deleteAccount: () => request("/api/account", { method: "DELETE" }),
listExtensionTokens: () => request("/api/extension/tokens"),
revokeExtensionToken: (id) => request(`/api/extension/tokens/${id}`, { method: "DELETE" }),
```

Create `src/Settings.jsx` with an explicit confirmation:

```jsx
import { useState } from "react";
import { api } from "./api.js";

export function Settings({ onClose }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function removeAccount() {
    setError("");
    try {
      await api.deleteAccount();
      window.location.assign("/");
    } catch {
      setError("We couldn't delete your account. Please try again or contact support.");
    }
  }

  return (
    <section className="settings" aria-label="Settings">
      <button onClick={onClose}>Back to library</button>
      <h1>Settings</h1>
      <h2>Delete account</h2>
      <p>This permanently deletes your saved posts, tags, and extension connections.</p>
      {!confirming ? (
        <button className="danger" onClick={() => setConfirming(true)}>Delete my account</button>
      ) : (
        <div className="danger-confirm">
          <p>This cannot be undone.</p>
          <button className="danger" onClick={removeAccount}>Permanently delete</button>
          <button onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
```

Wire a Settings button/state into `App.jsx`. Token listing/revocation is completed after Task 7 creates those endpoints.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test -- test/account-api.test.js
npm run build
```

Expected: deletion test passes and the settings view compiles.

- [ ] **Step 5: Commit account controls**

```bash
git add api/account.js api/_lib/db.js src/Settings.jsx src/App.jsx src/api.js src/styles.css test/account-api.test.js
git commit -m "feat: add account deletion controls"
```

## Task 7: Implement secure extension pairing and revocation

**Files:**
- Modify: `api/_lib/db.js`
- Create: `api/extension/pairings.js`
- Create: `api/extension/pairings/[id].js`
- Create: `api/extension/pairings/[id]/redeem.js`
- Create: `api/extension/tokens.js`
- Create: `api/extension/tokens/[id].js`
- Create: `src/ExtensionConnect.jsx`
- Modify: `src/App.jsx`
- Modify: `src/api.js`
- Modify: `src/Settings.jsx`
- Create: `test/pairing-api.test.js`

- [ ] **Step 1: Write the pairing lifecycle test**

Create `test/pairing-api.test.js` with mocked repository methods:

```js
import { describe, expect, it, vi } from "vitest";
import { request, response } from "./helpers/http.js";

const { createPairing, approvePairing, redeemPairing } = vi.hoisted(() => ({
  createPairing: vi.fn().mockResolvedValue({ id: "pair_1", expiresAt: "2026-07-14T12:10:00Z" }),
  approvePairing: vi.fn().mockResolvedValue(true),
  redeemPairing: vi.fn().mockResolvedValue({ token: "lis_ext_once", tokenId: "ext_1" }),
}));
vi.mock("../api/_lib/db.js", () => ({ createPairing, approvePairing, redeemPairing }));
vi.mock("../api/_lib/auth.js", () => ({
  hashSecret: (value) => `hash:${value}`,
  requireUser: vi.fn().mockResolvedValue({ userId: "user_a", kind: "web" }),
}));

import createHandler from "../api/extension/pairings.js";
import approveHandler from "../api/extension/pairings/[id].js";
import redeemHandler from "../api/extension/pairings/[id]/redeem.js";

describe("extension pairing", () => {
  it("creates, approves, and redeems a verifier once", async () => {
    const created = response();
    await createHandler(request({ method: "POST", body: { verifier: "v" } }), created);
    expect(created.body.id).toBe("pair_1");

    const approved = response();
    await approveHandler(request({ method: "PATCH", query: { id: "pair_1" } }), approved);
    expect(approvePairing).toHaveBeenCalledWith("pair_1", "user_a");

    const redeemed = response();
    await redeemHandler(request({ method: "POST", query: { id: "pair_1" }, body: { verifier: "v" } }), redeemed);
    expect(redeemed.body.token).toBe("lis_ext_once");
  });
});
```

Run: `npm test -- test/pairing-api.test.js`

Expected: FAIL because the pairing handlers do not exist.

- [ ] **Step 2: Add pairing/token tables and repository operations**

The schema in both `ensureSchema()` and `migrate-multi-account.mjs` must contain:

```sql
CREATE TABLE IF NOT EXISTS extension_pairings (
  id UUID PRIMARY KEY,
  verifier_hash TEXT NOT NULL,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS extension_tokens (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL DEFAULT 'Chrome extension',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
```

Add repository functions with these contracts:

```js
createPairing(id, verifierHash, expiresAt)
approvePairing(id, userId)
redeemPairing(id, verifierHash, rawToken, tokenHash, tokenId)
findExtensionToken(tokenHash)
listExtensionTokens(userId)
revokeExtensionToken(userId, tokenId)
```

`redeemPairing` must only succeed when `approved_at IS NOT NULL`, `consumed_at IS NULL`, `expires_at > now()`, and `verifier_hash` matches. It inserts the token hash and marks the pairing consumed before returning `{ token: rawToken, tokenId }`. `findExtensionToken` filters `revoked_at IS NULL` and updates `last_used_at`.

- [ ] **Step 3: Implement the five pairing/token handlers**

Generate identifiers and secrets with Node crypto:

```js
import crypto from "node:crypto";
const id = crypto.randomUUID();
const rawToken = `lis_ext_${crypto.randomBytes(32).toString("base64url")}`;
```

Handler rules:

- `POST /api/extension/pairings`: require a verifier string of 32–256 characters, store its hash, expire after 10 minutes, return `201` with id/expiry. No login required.
- `PATCH /api/extension/pairings/:id`: require a web actor, approve only an unexpired unconsumed row, return `204` or `404`.
- `POST /api/extension/pairings/:id/redeem`: require the original verifier, return `202` while awaiting approval, return the raw token once after approval, otherwise `409` for consumed and `410` for expired.
- `GET /api/extension/tokens`: require web actor and return id/label/createdAt/lastUsedAt, never a token hash.
- `DELETE /api/extension/tokens/:id`: require web actor and revoke only that user's row.

- [ ] **Step 4: Add the signed-in approval page**

Add API methods:

```js
approvePairing: (id) => request(`/api/extension/pairings/${id}`, { method: "PATCH" }),
listExtensionTokens: () => request("/api/extension/tokens"),
revokeExtensionToken: (id) => request(`/api/extension/tokens/${id}`, { method: "DELETE" }),
```

Create `src/ExtensionConnect.jsx`:

```jsx
import { useState } from "react";
import { api } from "./api.js";

export function ExtensionConnect({ pairingId }) {
  const [state, setState] = useState("ready");

  async function approve() {
    setState("working");
    try {
      await api.approvePairing(pairingId);
      setState("approved");
    } catch {
      setState("error");
    }
  }

  if (!pairingId) return <p>This connection link is incomplete.</p>;
  if (state === "approved") return <main className="connect-card"><h1>Extension connected</h1><p>You can close this tab.</p></main>;
  return (
    <main className="connect-card">
      <h1>Connect LinkedIn Saver?</h1>
      <p>When you choose Save on LinkedIn, the extension sends that post's visible content to your private library.</p>
      <button disabled={state === "working"} onClick={approve}>Connect extension</button>
      {state === "error" && <p className="error">This request expired. Start again from the extension.</p>}
    </main>
  );
}
```

In `App.jsx`, read `new URLSearchParams(location.search).get("pairing")`; render `ExtensionConnect` inside `SignedIn` when present, otherwise render the library.

- [ ] **Step 5: Complete token management in Settings**

On mount, call `api.listExtensionTokens()`. Render each connection with created/last-used dates and a Revoke button that calls `api.revokeExtensionToken(id)` and removes it locally. Empty state: `No extension is connected.`

- [ ] **Step 6: Run pairing tests and build**

Run:

```bash
npm test -- test/pairing-api.test.js test/auth.test.js test/account-api.test.js
npm run build
```

Expected: lifecycle and deletion tests pass; the approval page builds.

- [ ] **Step 7: Commit pairing backend and web approval**

```bash
git add api/_lib/db.js api/extension src/ExtensionConnect.jsx src/App.jsx src/api.js src/Settings.jsx src/styles.css scripts/migrate-multi-account.mjs test/pairing-api.test.js
git commit -m "feat: add secure extension pairing"
```

## Task 8: Convert the Chrome extension to paired-account auth

**Files:**
- Create: `extension/config.js`
- Create: `extension/lib/pairing-core.js`
- Modify: `extension/manifest.json`
- Modify: `extension/background.js`
- Modify: `extension/popup.html`
- Modify: `extension/popup.js`
- Modify: `extension/lib/save.js`
- Create: `test/extension-pairing.test.js`
- Delete: `extension/saved-import.js`

- [ ] **Step 1: Write pure pairing helper tests**

Create `test/extension-pairing.test.js`:

```js
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(async () => {
  globalThis.LIS = {};
  await import(`../extension/lib/pairing-core.js?test=${Math.random()}`);
});

describe("extension pairing helpers", () => {
  it("creates a verifier with enough entropy", () => {
    const verifier = globalThis.LIS.createPairingVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("recognizes an active stored connection", () => {
    expect(globalThis.LIS.connectionState({ extensionToken: "lis_ext_x" })).toBe("connected");
    expect(globalThis.LIS.connectionState({})).toBe("disconnected");
  });
});
```

Run: `npm test -- test/extension-pairing.test.js`

Expected: FAIL because `pairing-core.js` does not exist.

- [ ] **Step 2: Add fixed origin and pure helpers**

Create `extension/config.js`:

```js
globalThis.LIS_CONFIG = Object.freeze({
  appOrigin: "https://linkedin-saver.vercel.app",
});
```

Create `extension/lib/pairing-core.js`:

```js
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  LIS.createPairingVerifier = function createPairingVerifier() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  LIS.connectionState = function connectionState(stored) {
    return stored?.extensionToken?.startsWith("lis_ext_") ? "connected" : "disconnected";
  };
})();
```

- [ ] **Step 3: Reduce manifest permissions and remove import code**

Set:

```json
"permissions": ["storage"],
"host_permissions": [
  "https://linkedin-saver.vercel.app/*",
  "https://www.linkedin.com/*",
  "https://linkedin.com/*"
]
```

Load `config.js` and `lib/pairing-core.js` before popup code. In the background service worker use:

```js
importScripts("config.js", "lib/pairing-core.js", "dev-reload.js");
```

Remove `saved-import.js` from `content_scripts`, remove the popup import button/handler, and delete the file.

- [ ] **Step 4: Implement extension pairing in the background worker**

Add background message handlers:

```js
async function startPairing() {
  const verifier = globalThis.LIS.createPairingVerifier();
  const response = await fetch(`${LIS_CONFIG.appOrigin}/api/extension/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifier }),
  });
  if (!response.ok) throw new Error("Could not start connection");
  const pairing = await response.json();
  await chrome.storage.local.set({ pairingId: pairing.id, pairingVerifier: verifier });
  await chrome.tabs.create({ url: `${LIS_CONFIG.appOrigin}/?pairing=${encodeURIComponent(pairing.id)}` });
  return pairing;
}

async function pollPairing() {
  const { pairingId, pairingVerifier } = await chrome.storage.local.get(["pairingId", "pairingVerifier"]);
  if (!pairingId || !pairingVerifier) return { state: "disconnected" };
  const response = await fetch(`${LIS_CONFIG.appOrigin}/api/extension/pairings/${pairingId}/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifier: pairingVerifier }),
  });
  if (response.status === 202) return { state: "waiting" };
  if (!response.ok) throw new Error("Connection request expired");
  const { token } = await response.json();
  await chrome.storage.local.set({ extensionToken: token });
  await chrome.storage.local.remove(["pairingId", "pairingVerifier"]);
  return { state: "connected" };
}
```

Use these for `start-pairing` and `poll-pairing` messages. Change capture POST headers to:

```js
const { extensionToken } = await chrome.storage.local.get(["extensionToken"]);
if (!extensionToken) throw new Error("extension is not connected");
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${extensionToken}`,
};
```

On a capture `401`, remove `extensionToken`, show the error badge, and return `reconnect: true`.

- [ ] **Step 5: Replace the popup wizard with consent/connect states**

The disconnected popup must show:

```html
<section id="disconnected">
  <h2>Connect your private library</h2>
  <p>When you choose Save on LinkedIn, this extension sends that post's visible content and source details to your LinkedIn Saver account.</p>
  <label class="consent"><input id="consent" type="checkbox"> I understand what is captured.</label>
  <button id="connect" class="btn btn-primary" disabled>Connect LinkedIn Saver</button>
</section>
```

The connected popup shows `Connected`, `Open my library`, and `Disconnect this browser`. `popup.js` enables Connect only after consent, starts pairing, polls every two seconds for at most ten minutes, and renders actionable expired/network states. Disconnect removes `extensionToken` locally; server-side revocation remains available in Settings.

- [ ] **Step 6: Update capture error language**

In `extension/lib/save.js`, map `401` to `reconnect the extension` instead of `wrong app password`, retain server/network messages, and keep the no-silent-retry behavior.

- [ ] **Step 7: Run tests and validate the manifest**

Run:

```bash
npm test -- test/extension-pairing.test.js
node -e "JSON.parse(require('node:fs').readFileSync('extension/manifest.json')); console.log('manifest ok')"
npm test
```

Expected: helper tests pass, `manifest ok` prints, and the full suite passes.

- [ ] **Step 8: Commit the paired extension**

```bash
git rm extension/saved-import.js
git add extension test/extension-pairing.test.js
git commit -m "feat: pair Chrome extension to private accounts"
```

## Task 9: Remove deferred collection surfaces and polish first use

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/PostCard.jsx`
- Modify: `src/api.js`
- Modify: `src/styles.css`
- Delete: `src/CollectionSidebar.jsx`
- Delete: `api/collections.js`
- Delete: `api/collections/[id].js`
- Delete: `api/collections/[id]/posts.js`
- Delete: `api/post-collection.js`
- Create: `test/library-scope.test.jsx`

- [ ] **Step 1: Write the beta-scope UI test**

Create `test/library-scope.test.jsx` around the extracted signed-in `Library` component:

```jsx
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
```

Run: `npm test -- test/library-scope.test.jsx`

Expected: FAIL until the empty state and exported component are updated.

- [ ] **Step 2: Remove collection state and actions**

In `App.jsx`, delete collection imports/state/loading/filtering/sidebar/callbacks. Load only `api.listPosts()`. Use a single content column.

In `PostCard.jsx`, change the signature to:

```jsx
export function PostCard({ post, onUpdated, onDeleted, onTagClick, activeTags = [] })
```

Change `persist` to:

```js
const persist = (tags, suggested) =>
  api.updatePost(post.id, { tags, suggested }).then(onUpdated);
```

Remove `showCollectionDropdown`, `toggleCollection`, collection props, `FolderIcon`, and collection markup.

Remove all collection methods from `src/api.js`.

- [ ] **Step 3: Add the lovable empty state**

For zero posts, render:

```jsx
<section className="empty-onboarding">
  <span className="state-icon"><InboxIcon /></span>
  <h2>Save your first useful post</h2>
  <p>Install the extension, then use LinkedIn's normal Save action. The post will appear here automatically.</p>
  <a className="btn-primary" href={import.meta.env.VITE_CHROME_STORE_URL} target="_blank" rel="noreferrer">
    Install Chrome extension
  </a>
</section>
```

Add `VITE_CHROME_STORE_URL` to `.env.example`. During pre-submission testing it can point to the project's extension-install documentation; before beta invites it must be the unlisted Store URL.

- [ ] **Step 4: Delete unused routes/components**

```bash
git rm src/CollectionSidebar.jsx api/collections.js api/collections/[id].js api/collections/[id]/posts.js api/post-collection.js
```

- [ ] **Step 5: Run UI tests and build**

Run:

```bash
npm test -- test/library-scope.test.jsx test/app-auth.test.jsx
npm run build
```

Expected: both UI tests pass and Vite succeeds.

- [ ] **Step 6: Commit the reduced product surface**

```bash
git add .env.example src/App.jsx src/PostCard.jsx src/api.js src/styles.css test/library-scope.test.jsx
git commit -m "refactor: focus beta on capture and retrieval"
```

## Task 10: Add public-repo, privacy, and Store-release material

**Files:**
- Create: `PRIVACY.md`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `docs/chrome-web-store-checklist.md`
- Modify: `README.md`
- Modify: `extension/manifest.json`
- Modify: `package.json`

- [ ] **Step 1: Write the privacy policy with concrete data behavior**

`PRIVACY.md` must state:

- The extension captures visible post text, author/source details, links, media references, and timestamps only after the user chooses LinkedIn Save.
- Account email/identity is processed by Clerk; library data is stored in Neon and served by Vercel.
- Optional Anthropic processing is disabled for the hosted beta unless the policy is amended and explicit consent is added.
- Data is used only to provide the private searchable library, never for advertising or sale.
- Data is encrypted in transit; secrets are not stored in plaintext.
- Users can export CSV, revoke extension access, and permanently delete the account in Settings.
- Support and privacy requests use `https://github.com/EgorDranev/linkedin-saver/issues`; security reports use GitHub's private security-advisory form for the repository.

- [ ] **Step 2: Add security and contribution guidance**

`SECURITY.md` must ask reporters not to open public issues for authentication, data-isolation, or extension-token vulnerabilities and link to `https://github.com/EgorDranev/linkedin-saver/security/advisories/new`.

`CONTRIBUTING.md` must include:

```bash
npm install
cp .env.example .env.local
vercel dev
npm test
npm run build
```

It must also explain loading `extension/` unpacked for development, changing `extension/config.js` for a self-hosted origin, and never committing Clerk/Neon keys.

- [ ] **Step 3: Rewrite README around the hosted user path**

Order README sections as:

1. One-line value proposition and hosted beta status.
2. How invited users sign in, install from the unlisted link, connect once, and save normally.
3. Data/privacy summary linking `PRIVACY.md`.
4. Demo screenshots/GIF.
5. Architecture.
6. Contributor setup and migration command.
7. Extension development and packaging.
8. License/security links.

Remove claims that users need to deploy Vercel/Neon or set Anthropic keys to use the hosted beta. Keep self-hosting explicitly labeled as contributor/advanced setup.

- [ ] **Step 4: Add a release checklist and packaging command**

Create `docs/chrome-web-store-checklist.md` with checkboxes for:

- Developer account registration and 2-Step Verification.
- Unlisted visibility.
- Single-purpose statement.
- Privacy policy URL and Limited Use disclosure.
- Permission justifications for `storage` and both host groups.
- Consent screenshot, connected-state screenshot, library screenshot, 1280×800 promotional image, 128×128 icon.
- Support URL/email.
- Manual capture/reconnect/account-isolation smoke tests.
- Version bump and ZIP validation.

Add this script to `package.json`:

```json
"extension:package": "cd extension && zip -r ../linkedin-saver-extension.zip . -x 'dev-reload.js'"
```

Run `npm run extension:package`, inspect the ZIP contents, then remove the generated ZIP so it is not committed.

- [ ] **Step 5: Run public-release verification**

Run:

```bash
npm test
npm run build
npm run extension:package
git diff --check
git status --short
```

Expected: all tests pass, build succeeds, the extension ZIP is created, no whitespace errors appear, and only intentional source/docs changes plus the generated ZIP are shown.

- [ ] **Step 6: Commit release documentation**

```bash
git add README.md PRIVACY.md SECURITY.md CONTRIBUTING.md docs/chrome-web-store-checklist.md extension/manifest.json package.json
git commit -m "docs: prepare unlisted Chrome beta"
```

## Task 11: Production migration and end-to-end beta gate

**Files:**
- Modify: `README.md` only if the rehearsal reveals an incorrect instruction.
- Modify: `docs/chrome-web-store-checklist.md` only to record verified results.

- [ ] **Step 1: Configure Clerk production**

In the Clerk dashboard:

- Enable email verification links as the only sign-in/sign-up strategy.
- Enable same-device-and-browser protection for email links.
- Set the application to restricted sign-ups and invite each beta email.
- Add the production app origin and redirect URLs.
- Configure the production sending domain with SPF/DKIM and DMARC.
- Copy publishable/secret keys into Vercel production environment variables.

- [ ] **Step 2: Rehearse migration against a Neon branch**

Create a Neon branch from production, point local `DATABASE_URL` at it, set `FOUNDER_USER_ID` to the real Clerk founder id, then run:

```bash
npm run migrate:multi-account
npm run migrate:multi-account
```

Expected: both runs print `Multi-account migration complete`; the second run changes no ownership and raises no constraint error. Verify the original post count is unchanged and every owned table has zero null `user_id` rows.

- [ ] **Step 3: Run two-account isolation acceptance**

Using two invited Clerk test accounts:

1. Pair one Chrome profile to Account A and another Chrome profile to Account B.
2. Save a distinct LinkedIn post in each profile.
3. Confirm each library, search, tag list, and CSV contains only its own post.
4. Attempt Account A's post id through Account B's GET/PATCH/DELETE calls; expect `404`.
5. Revoke Account A's extension; its next capture must return `401` and the popup must show reconnect.
6. Delete Account B; confirm its posts/tags/tokens are gone and its Clerk session no longer works.

- [ ] **Step 4: Run capture reliability acceptance**

On current LinkedIn feed markup, verify:

- Text-only post capture.
- Image post capture.
- Article/link post capture.
- Duplicate Save does not create another record.
- Offline capture shows a clear network error and does not silently retry.
- Returning online and pressing Save again creates exactly one record.

Record pass/fail and browser/extension version in `docs/chrome-web-store-checklist.md`.

- [ ] **Step 5: Deploy in safe order**

1. Set Vercel Clerk variables and `APP_ORIGIN`.
2. Run the tested migration once against production.
3. Deploy the web/API build.
4. Run the two-account web acceptance again.
5. Package and submit the extension as unlisted.
6. After Store approval, set `VITE_CHROME_STORE_URL` to the unlisted listing and redeploy the web app.

- [ ] **Step 6: Final verification commit**

If rehearsal changed documentation:

```bash
git add README.md docs/chrome-web-store-checklist.md
git commit -m "docs: record public beta verification"
```

If no documentation changed, do not create an empty commit.

## Completion definition

The implementation is complete only when:

- An invited non-technical user can use a same-device email link, install the unlisted extension, approve pairing, and capture without entering a server URL or password.
- Automated tests prove unauthenticated rejection, user isolation, token revocation, and account deletion.
- Manual two-account tests prove no cross-account reads, writes, exports, or captures.
- Deferred collection/import/AI-export surfaces are absent from the hosted beta.
- Privacy, security, deletion, support, and Chrome Store disclosures are published and consistent with actual behavior.
- The production build passes and the unlisted Store package contains only required extension files.
