# Chrome Web Store release checklist (unlisted beta)

Work through this list in order for every Store submission. Record results
(pass/fail, browser + extension version) next to the smoke-test items.

## Developer account

- [ ] Chrome Web Store developer account registered (one-time fee paid).
- [ ] 2-Step Verification enabled on the publishing Google account.

## Listing configuration

- [ ] Visibility set to **Unlisted** (invitees get the direct Store URL; no
      public discovery).
- [ ] Single-purpose statement entered: *"Store LinkedIn posts the user
      chooses to bookmark in their private, searchable library."*
- [ ] Privacy policy URL set to
      `https://github.com/EgorDranev/linkedin-post-organizer/blob/main/PRIVACY.md`.
- [ ] Limited Use disclosure completed: data is captured only on the user's
      explicit Save action, used only to provide the user's private library,
      not used for advertising, and never sold.

## Permission justifications

- [ ] `storage` — persists the extension's pairing state and capture
      credential locally.
- [ ] Host group 1 (app origin, `https://linkedin-saver.vercel.app/*`) —
      required to send captured posts to the user's own library and to run the
      pairing flow.
- [ ] Host group 2 (LinkedIn, `https://www.linkedin.com/*` and
      `https://linkedin.com/*`) — required to detect the user's native Save
      action and read the visible content of the post being saved.

## Assets

- [ ] Screenshot: extension consent/connect popup (pre-pairing disclosure).
- [ ] Screenshot: connected state (popup showing "Connected").
- [ ] Screenshot: library with saved posts, tags, and search.
- [ ] Promotional image, 1280×800.
- [ ] Extension icon, 128×128.

## Support

- [ ] Support URL set to
      `https://github.com/EgorDranev/linkedin-post-organizer/issues`.
- [ ] Support email set and monitored.

## Pre-submission smoke tests (manual)

- [ ] Capture: sign in, pair a fresh Chrome profile, save a LinkedIn post,
      confirm it appears once in the library with usable text and tags.
- [ ] Reconnect: revoke the extension in Settings, confirm the next capture
      fails with reconnect guidance, re-pair, and confirm capture works again.
- [ ] Account isolation: with two accounts in two Chrome profiles, confirm
      each library/search/CSV contains only its own posts and cross-account
      post ids return `404`.

## Package

- [ ] Version bumped in `extension/manifest.json` (and listing notes updated).
- [ ] `npm run extension:package` run; ZIP contents inspected — contains only
      the files in `extension/` minus dev-only files (`dev-reload.js`), and no
      secrets, `.env*`, or source maps.
- [ ] ZIP uploaded to the Store dashboard; generated ZIP deleted locally (it
      is never committed).
