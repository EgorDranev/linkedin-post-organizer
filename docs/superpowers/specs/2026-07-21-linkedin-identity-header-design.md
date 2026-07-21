# LinkedIn Identity Header Design

## Context

Saved-post cards currently collapse author metadata into a name and an optional combined secondary line. When capture metadata is incomplete, the card can show only the author name above the post body. This loses the identity hierarchy visible on LinkedIn: the author's role, profile or website action, publication time, and visibility.

The approved target follows LinkedIn's compact identity hierarchy while retaining LinkedIn Saver's existing light theme, card actions, and scan-friendly density.

## Identity hierarchy

Each card header contains up to three text rows beside the author avatar:

1. Author name, followed by an optional captured connection-degree indicator.
2. Author headline, truncated to one line.
3. An optional captured author website link, followed by publication time and an optional public-visibility icon.

The existing open, reader, and delete actions stay at the right edge of the header. The post body begins below the complete identity block.

## Metadata model

The extension stores the following optional identity fields when LinkedIn exposes them:

- `authorHeadline`: the author's role or profile headline.
- `metadata.connectionDegree`: the displayed LinkedIn connection degree, such as `2nd`.
- `metadata.authorAction`: an object containing the author-level action label and URL, such as `{ text: "Visit my website", url: "https://example.com" }`.
- `metadata.publishedText`: LinkedIn's displayed publication label, such as `6h`.
- `metadata.publishedDate`: the parsed publication date when available.
- `metadata.visibility`: `public` only when LinkedIn exposes a public-visibility indicator for the post.

These fields describe the top-level actor of the captured post. Body links and attachment links must not be promoted into `authorAction` merely because they are external.

## Extraction rules

Use actor-scoped LinkedIn elements before any generic fallback:

- Read the headline from the actor description.
- Read connection degree from the actor name or actor metadata only when it matches a bounded degree token such as `1st`, `2nd`, or `3rd`.
- Read `authorAction` only from a visible link in the actor/header scope with a non-empty human label and an HTTP or HTTPS target.
- Read publication text from the actor sub-description or time element, stripping visibility text and separators from the stored label.
- Set visibility to `public` only when the actor time row exposes LinkedIn's public/globe label or equivalent accessible text.

Missing or ambiguous values remain absent. Extraction must not infer a connection degree, website action, or visibility from unrelated post content.

## Rendering rules

- Preserve the current card width and visual theme.
- Increase the identity avatar only as needed to balance the three-row block; use a compact 40px square target rather than reproducing LinkedIn's entire feed chrome.
- Keep the author name as the strongest text.
- Render connection degree after a muted separator on the author row.
- Render the headline as a separate muted row with one-line ellipsis.
- Render the author action as a blue link on the third row.
- Prefer captured publication metadata in this order: valid `publishedDate`, `publishedText`, then a clearly labeled saved-date fallback.
- Render the globe icon only for `metadata.visibility === "public"`.
- Omit unavailable segments and their separators without leaving blank rows.
- On narrow screens, let the identity text use the space beneath the action controls without horizontal overflow.

## Legacy saves

Existing records are not rewritten or enriched from LinkedIn. They render whichever identity fields they already contain. When publication metadata is missing but `savedAt` is valid, the card shows the existing `Saved <date>` fallback. The app never presents a saved date as the publication time.

## Boundaries

This change covers top-level post identity capture and card rendering only. It does not:

- fetch LinkedIn pages from the server or browser app;
- backfill existing records;
- redesign the post body, media, tags, reader, or card actions;
- split quoted reposts into nested cards;
- infer author metadata from body links or attachment content.

## Error handling

- Invalid dates do not render as `Invalid Date`.
- Invalid, unsafe, or unlabeled author-action URLs are omitted.
- Unknown connection-degree and visibility values are omitted.
- Empty fields never produce orphan separators or empty rows.

## Verification

- Extraction tests cover headline, connection degree, author action, publication label, and public visibility from an actor fixture.
- Extraction tests confirm body links are not promoted to author actions.
- Rendering tests cover the complete three-row hierarchy and partial metadata.
- Rendering tests confirm invalid or absent fields leave no empty separators or icons.
- CSS contract tests cover headline truncation, compact avatar sizing, and narrow-screen overflow.
- Existing tests remain green and the production build succeeds.
