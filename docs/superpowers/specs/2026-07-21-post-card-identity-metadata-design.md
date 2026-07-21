# Post Card Identity Metadata Design

## Context

The post card already renders the author name and can display captured headline and publication metadata. Older or incomplete captures often omit those fields, leaving only the author name and making the identity header visually inconsistent.

The approved design matches the compact reference hierarchy while preserving the current light theme and existing card actions.

## Identity hierarchy

Each card header contains:

1. A 32px author avatar or monogram.
2. The author name as the primary line.
3. A compact secondary line containing available role/source metadata and a date.
4. The existing open, reader, and delete actions at the right edge.

The author name remains the strongest text. The secondary line uses the existing muted color and small type scale.

## Metadata precedence

### Headline

Use the first non-empty value from:

1. `post.authorHeadline`
2. `post.metadata.companyInfo`

For posts whose source is outside LinkedIn, keep the existing external host after the headline.

### Date

Use the first valid value from:

1. `post.metadata.publishedDate`, formatted as `Jul 19 2026`
2. `post.metadata.publishedText`, using the captured LinkedIn label
3. `post.savedAt`, formatted as `Saved Jul 21 2026`

If every date value is missing or invalid, omit the date rather than rendering an invalid label.

The exact publication date takes precedence over relative captured text such as `2d` when both exist.

## Layout behavior

- The avatar is fixed at 32px square.
- The identity block is flexible and may shrink before the action controls.
- The headline/source portion stays on one line and truncates with an ellipsis.
- The separator and date do not shrink or wrap.
- When no headline or external source exists, the date begins the secondary line without a leading separator.
- The header remains a two-line identity block at desktop and mobile widths.
- Existing profile links, avatar fallbacks, hover states, actions, and accessibility labels remain unchanged.

## Implementation boundary

Change only the post-card identity metadata formatting, its header styles, and focused tests. Do not alter extraction, stored post data, APIs, the card body, media, tags, reader mode, or the application theme.

## Error handling

Date parsing must reject invalid values. Missing headline, company, publication, and saved-date fields must not render empty separators or `Invalid Date`.

## Verification

- Unit tests cover exact publication-date precedence, captured-text fallback, saved-date fallback, and invalid/missing dates.
- Rendering tests confirm the fallback appears in the secondary line without an empty separator.
- CSS contract tests confirm the 32px avatar, flexible/truncated metadata, and fixed date segment.
- Existing tests remain green and the production build succeeds.
- Visual checks cover a long headline at desktop and mobile widths with no overlap or horizontal overflow.
