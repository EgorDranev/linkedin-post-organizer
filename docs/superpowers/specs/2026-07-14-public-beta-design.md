# LinkedIn Saver public beta design

## Decision

Ship LinkedIn Saver as a hosted, multi-account product for non-technical
users. The initial distribution is an unlisted Chrome Web Store beta. The
repository remains public and self-hostable for contributors, but self-hosting
is not the normal customer setup.

## Product boundary

LinkedIn Saver is a private, searchable library for the LinkedIn posts a person
chooses to save. Its promise is: use LinkedIn's existing Save action, then
re-find the post later.

The beta's essential loop is:

1. A person enters their email address and receives a magic sign-in link.
2. They sign in and install the Chrome extension from the unlisted Store page.
3. They pair the extension with their account once.
4. Saving a post with LinkedIn's native Save button captures it into their
   private library and suggests tags.
5. They later retrieve it through full-text/author search or tag filters.

No Vercel, database, API key, Chrome developer mode, or shared password is
required from a beta user. Tagging works without an AI key using the current
offline heuristic.

## In scope

- Email magic-link accounts.
- A private library per user.
- Secure extension pairing and token revocation.
- Native LinkedIn Save capture.
- Suggested tags, search, tag filtering, post edit/delete, and CSV export.
- An unlisted Chrome Web Store listing and its compliance material.
- A public README, hosted setup guidance, privacy policy, security contact, and
  contributor guidance.
- Automated coverage of account isolation plus critical authentication and
  capture paths.

## Explicitly out of scope

- Shared workspaces, teams, collaboration, and billing.
- Collections.
- AI summaries and theme clustering.
- HTML/XLSX export.
- Existing LinkedIn Saved backlog import.
- Safari, iOS, and mobile support.
- Social login and password login.

The app stays open source, but the hosted beta is the supported user experience.

## Account and data architecture

Keep the existing React frontend, Vercel serverless API shape, Neon Postgres,
LinkedIn capture extraction, and offline tagger. Add a managed authentication
provider with passwordless email links; it owns sign-in and passwordless email
delivery, while the app stores no passwords.

Each data record that belongs to a person is owned by an authenticated user.
Posts, tags, collections (if retained only for migration compatibility), and
their join records have an owner boundary. API handlers resolve the signed-in
user server-side. They never accept a client-provided owner id and scope every
read and mutation to the current user.

Existing unowned data is moved once to a configured founder account. New
account users can neither read nor mutate it.

The browser extension never stores a magic link or normal browser session. A
signed-in web user starts a short-lived pairing flow. The extension receives a
revocable, capture-only credential associated with that user. Capture requests
use this credential; deleting/revoking the pairing immediately disables it.

## Beta user experience

The public website explains the product and routes invited people to email
sign-in. After first sign-in, an empty library gives one primary action:
install and connect the extension.

Before pairing, the product explicitly says that, when the user selects
LinkedIn's Save action, the extension sends the visible post content and related
metadata to that user's private library. A successful pairing confirms the
connected state. Normal use adds no new action in LinkedIn: saving a post
triggers a non-disruptive success or actionable error notice.

The product must never silently retry a failed capture in a way that creates
duplicates. A disconnected extension presents reconnect guidance. Settings
contains CSV export, connected-extension revocation, and account deletion.

## Chrome distribution and privacy

The first extension release is an unlisted Chrome Web Store item. Invitees get
the direct Store URL, and Chrome provides normal installation and updates. A
public Store listing is deferred until the core loop has been validated with a
small beta cohort.

The Store listing, onboarding disclosure, and privacy policy describe one
purpose: store LinkedIn posts the user chooses to bookmark in their private,
searchable library. They must accurately disclose captured content, account and
pairing data, storage, retention, export/deletion controls, support contact,
and the absence of advertising or sale of content. The extension requests only
permissions demonstrably required for this flow.

Safari/App Store distribution is deferred. It requires a separately packaged
Safari web extension inside an Apple app and is not a beta launch requirement.

## Reliability and acceptance criteria

Before beta release, prove the following:

- A user can request and use a magic link, and a signed-out request cannot read
  protected data.
- User A cannot read, edit, delete, export, or capture into User B's library.
- Pairing creates a credential usable only for its owner; revoked/expired
  credentials fail cleanly.
- Saving a supported LinkedIn post creates one owned record with usable text,
  author/source where available, and tag suggestions.
- A repeated capture does not create an unintended duplicate.
- Search and tags return only the current user's posts.
- CSV export includes only the current user's selected posts.
- Account deletion removes the user data and invalidates extension access.
- The app and extension explain recoverable failures in plain language.
- A production build and a documented local setup succeed without secrets being
  committed.

## Release sequence

1. Implement authentication, ownership enforcement, and migration.
2. Implement extension pairing and revoke support.
3. Remove deferred UI and API surfaces from the beta path.
4. Add privacy/deletion/support material and perform a manifest-permission audit.
5. Add automated critical-path tests and run a small private pilot.
6. Submit an unlisted Chrome Web Store package, then distribute the link to
   invited testers.

## Future triggers

Reconsider public Store visibility after roughly 10–30 people complete the
capture-to-retrieval loop. Add Safari only after Chrome beta feedback confirms
that the core job is valuable. Add collaboration or paid plans only after
private-library retrieval is repeatedly used.
