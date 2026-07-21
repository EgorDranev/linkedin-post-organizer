# Post Card Density Design

## Goal

Make saved-post cards easier to scan and closer to the compact reference layout while preserving the existing light theme, data, and interactions.

## Current problem

The current card uses the full application width and 24px content padding. Portrait media is constrained to a 480px-high frame with `object-fit: contain`, which produces large side gutters and makes the attachment look detached from the post. The wide layout also weakens the relationship between author identity, text, media, and actions.

## Approved direction

Use a focused, centered card column with a maximum width of 720px.

- Keep the existing light color palette, typography, radii, and elevation tokens.
- Keep search, top navigation, and browse controls at their existing width.
- Center the `To review` and `Filed` sections within the application content area.
- Reduce card content padding from 24px to 16px.
- Tighten the author header and action grouping without removing or changing actions.
- Display card media at its natural aspect ratio and full available width.
- Remove the 480px media-height cap that creates letterboxing for portrait images.
- Keep media inside the card padding with the existing nested radius.
- Preserve tags, suggestions, hashtags, engagement counts, saved date, reader modal, filtering, deletion, and original-post links.

## Responsive behavior

- Desktop and tablet: center cards in a column capped at 720px.
- Mobile: use the available width with 16px page gutters and card padding.
- Prevent long author names and headlines from pushing action controls out of the card.
- Keep interactive controls comfortably tappable on touch layouts.

## Error and fallback behavior

Existing media failure behavior remains unchanged: if a thumbnail fails, the card falls back to the compact attachment/type treatment. Missing avatars continue to use the generated monogram.

## Verification

Verify the card with:

- portrait media;
- landscape media;
- multi-image gallery metadata;
- missing or expired media;
- long author name and headline;
- long post text and reader expansion;
- accepted and suggested tags;
- desktop and mobile viewports.

Run the full test suite and production build. The implementation is complete when the card is centered and compact, portrait media no longer appears inside a wide letterboxed frame, existing interactions still work, and all checks pass.

## Out of scope

- Dark mode or a new theme.
- Changes to capture, API, or database behavior.
- New card actions or content fields.
- A fixed crop that hides part of an image.
- Redesigning search, navigation, settings, or the reader modal.
