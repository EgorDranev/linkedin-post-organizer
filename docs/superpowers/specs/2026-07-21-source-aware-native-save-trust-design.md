# Source-Aware Native Save Trust Design

## Context

The previous fix stopped LinkedIn's portaled Save menu from replacing the intended post with a nearby comment or image overlay. It also added a strict structural validator before capture.

On a normal LinkedIn feed post, clicking `...` and then `Save` now shows `couldn't find the post`. LinkedIn's current feed markup can hide or rename the activity, actor, and commentary markers required by the strict validator even when `findPostFrom` correctly resolves the root containing the clicked overflow trigger.

## Decision

Use source-aware trust. A connected post root resolved directly from the overflow trigger the user clicked is trusted for the lifetime of the existing context TTL. It does not need to pass the generic structural validator.

Keep strict validation for candidates found only through screen coordinates, distance, or broad fallback scans. These are the sources that can accidentally select image viewers, comments, or other overlays.

## Capture flow

1. When the user clicks a recognized overflow trigger inside a feed post, store the resolved root with source `trigger`.
2. When the portaled Save menu item is clicked, do not perform a point-based lookup at the menu coordinates.
3. Prefer an exact direct or menu-owner root when it passes normal validation.
4. Otherwise, accept the fresh connected `trigger` root because its relationship to the user's click is authoritative.
5. Use proximity or fallback candidates only when they pass the existing strict post validator.
6. If no trusted or validated candidate exists, retain the current error toast and send no capture.

## Trust boundary

Only `trigger` context receives this exception. `direct`, `menu-owner`, and `proximity` candidates do not become broadly trusted merely because they were stored recently.

The trusted element must still be connected to the document and younger than the existing 20-second TTL. A later trigger click may replace it. Lower-quality hover and coordinate context cannot replace it while it is fresh.

This preserves the earlier overlay protection: an overlay-only Save click has no trigger-bound post and therefore remains rejected.

## Testing

Add a regression fixture for a normal feed post whose root has no activity URN, recognized post class, actor class, or commentary class. Its overflow trigger is recognized, `findPostFrom(trigger)` resolves the root, and the generic validator returns false. Clicking the trigger and then the portaled Save item must capture that root.

Retain and rerun the existing cases:

- a trigger-bound post wins over a competing overlay;
- an overlay-only candidate produces the error toast and no capture;
- validated proximity fallback still works without stronger context;
- the complete extractor and extension test suite remains green.

## Scope

- No stored-data or API changes.
- No changes to card rendering or author extraction.
- No global relaxation of the post validator.
- No delayed rescans, timers, or server-side LinkedIn fetching.
- Existing incorrect records are not rewritten.
