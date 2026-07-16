# Privacy Policy — LinkedIn Saver

_Last updated: 2026-07-16_

LinkedIn Saver has one purpose: store the LinkedIn posts you choose to bookmark
in your own private, searchable library. This policy describes exactly what
data the hosted beta collects, where it lives, and the controls you have over
it.

## What the extension captures

The Chrome extension captures content **only after you choose LinkedIn's Save
action on a post**. It does not read your feed in the background, track your
browsing, or capture anything you did not explicitly save.

For each saved post it captures:

- The visible post text.
- Author and source details shown with the post (name, headline, profile link).
- Links contained in or attached to the post.
- References to media attached to the post (for example image URLs).
- Timestamps (when the post was published, when you saved it).

Nothing else on LinkedIn — messages, connections, other people's activity, or
posts you merely scroll past — is read or transmitted.

## Account and pairing data

- **Account identity.** Sign-in uses passwordless email links handled by
  [Clerk](https://clerk.com), our authentication provider. Clerk processes your
  email address and sign-in events; LinkedIn Saver never sees or stores a
  password because there isn't one.
- **Extension pairing.** Connecting the extension to your account creates a
  revocable, capture-only credential tied to your user. It can only add posts
  to your own library. Revoking it in Settings (or deleting your account)
  disables it immediately.

## Where your data is stored

- Your library (posts, tags, and related records) is stored in
  [Neon](https://neon.tech) Postgres and served by the app's API hosted on
  [Vercel](https://vercel.com).
- Every record is owned by your account. The API resolves your identity
  server-side and scopes every read and write to your own data — other users
  cannot see, search, edit, export, or delete your posts.
- Data is encrypted in transit (HTTPS/TLS). Secrets and credentials are not
  stored in plaintext.

## AI processing

Optional AI processing via Anthropic is **disabled for the hosted beta**. Tag
suggestions are computed with offline heuristics; your saved content is not
sent to any AI provider. If this ever changes, this policy will be amended
first and explicit consent will be added before any such processing occurs.

## How your data is used

Your data is used **only** to provide your private searchable library: storing
the posts you save, suggesting tags, and powering your own search and export.

- No advertising. Your data is never used for ads or ad targeting.
- No sale. Your content is never sold, rented, or shared with third parties
  beyond the infrastructure providers named above (Clerk, Neon, Vercel), which
  process it solely to operate the service.

## Retention, export, and deletion

- Your posts are retained until you delete them or delete your account.
- **Export:** you can export your saved posts as CSV at any time in Settings.
- **Revoke:** you can revoke the connected extension's access at any time in
  Settings; revoked credentials stop working immediately.
- **Delete:** you can permanently delete your account in Settings. Deletion
  removes your posts, tags, and extension credentials and invalidates your
  sign-in.

## Support and contact

- Support and privacy requests: open an issue at
  <https://github.com/EgorDranev/linkedin-post-organizer/issues>.
- Security reports: please use GitHub's private security-advisory form for this
  repository instead of a public issue —
  <https://github.com/EgorDranev/linkedin-post-organizer/security/advisories/new>. See
  [SECURITY.md](SECURITY.md).

## Changes to this policy

Material changes to this policy will be published in this file (the repository
is public) before they take effect.
