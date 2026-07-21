# Post Card Media Containment Design

## Context

The compact post-card update constrained the card column to 720px but allowed captured images to render at their full natural height. Tall screenshots and collages therefore make individual cards much taller than the viewport and defeat the compact browsing layout.

This spec supersedes only the natural-height media behavior in `2026-07-21-post-card-density-design.md`. The existing light theme, 720px card column, card spacing, typography, controls, captions, and click behavior remain unchanged.

## Approved behavior

- Every primary captured-media preview uses a 16:9 frame.
- The complete image remains visible inside that frame.
- Images preserve their intrinsic proportions and are never stretched.
- Portrait and unusually tall images receive neutral side space rather than being cropped.
- Landscape images receive neutral top and bottom space when their ratio does not match the frame.
- The neutral frame uses the existing `--surface-3` theme token.
- The rule applies at desktop and mobile widths.
- Clicking the media continues to open the captured media exactly as it does today.

## Implementation boundary

Change only the post-card media frame and image sizing rules plus their focused regression test. Do not change card width, content structure, saved post data, media URLs, captions, theme tokens, or interaction behavior.

## CSS contract

The media frame establishes a 16:9 aspect ratio, clips any rendering overflow, centers its child, and uses the existing neutral background. The image fills the available frame dimensions while using `object-fit: contain`.

## Responsive behavior

The frame remains 16:9 at every supported width. Because its width is fluid, its height scales with the card instead of requiring a separate mobile height.

## Verification

- Automated CSS contract test checks the 16:9 frame and contained image behavior.
- Existing test suite remains green.
- Production build succeeds.
- Visual checks cover desktop and mobile cards with a tall portrait/collage image.
- The image is fully visible, the card has no horizontal overflow, and the preview no longer grows to the image's natural height.
