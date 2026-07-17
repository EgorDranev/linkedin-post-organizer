# Contributing to LinkedIn Saver

Thanks for helping out. This repository is public; the hosted beta at
<https://linkedin-saver.vercel.app> is the supported user experience, and
everything below is for contributors and self-hosters.

## Local setup

```bash
npm install
cp .env.example .env.local
vercel dev
npm test
npm run build
```

- `vercel dev` serves the Vite + React frontend and the `/api` serverless
  functions together on <http://localhost:3000>.
- Fill `.env.local` with your own values: a Postgres connection string
  (`DATABASE_URL`, e.g. a free Neon database) and your own Clerk application
  keys (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`) configured for email verification links.
- `npm test` runs the Vitest suite; `npm run build` must pass before a PR.

## Extension development

1. Open Chrome → `chrome://extensions` → enable **Developer mode** →
   **Load unpacked** → select the `extension/` directory.
2. The installed extension talks to the origin fixed in
   `extension/config.js` (`https://linkedin-saver.vercel.app` by default).
   For a self-hosted or local backend, change `appOrigin` there — e.g. to
   `http://localhost:3000` — before loading or packaging the extension.
3. While editing extension files, `npm run ext:watch` reloads the unpacked
   extension and refreshes open LinkedIn tabs on every save.
4. `npm run extension:package` produces the Store ZIP
   (`linkedin-saver-extension.zip`, dev-only files excluded). Do not commit
   the ZIP.

## Secrets

**Never commit Clerk or Neon keys** (or any other credential). Real values
belong in `.env.local` (gitignored) or in Vercel environment variables.
`.env.example` contains placeholders only — keep it that way.

## Pull requests

- Branch from `main`; changes land on `main` via pull requests.
- Keep changes focused, include tests for behavior changes, and make sure
  `npm test` and `npm run build` pass.
- For security-sensitive findings, follow [SECURITY.md](SECURITY.md) instead of
  opening a public issue.
