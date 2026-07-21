# Native Save Context Protection Design

## Context

Fresh captures can still credit the logged-in viewer and save overlay accessibility text instead of the LinkedIn post. The reproduced result stores `Egor Dranev` with body text such as `Image in comment shared by Suprava Sabat`, while the visible post is authored by Suprava Sabat.

The author and text extractors are operating on the DOM root they receive. The failure occurs earlier, while resolving which post belongs to LinkedIn's native Save action.

## Root cause

LinkedIn renders the overflow menu outside the post subtree. The extension correctly remembers the post when the user opens its overflow trigger. When the user then clicks the portaled Save menu item, `onNativeSaveClick` also performs a point-based lookup at the menu item's coordinates.

That proximity lookup can resolve an image viewer, comment overlay, or other nearby content candidate. `rememberPost` currently accepts the latest candidate unconditionally, so this lower-quality candidate overwrites the fresh trigger-bound post. Extraction then reads the viewer's comment-composer identity and attachment accessibility label from the wrong root.

## Resolution model

Store capture context with its origin and quality instead of storing only the last element:

1. `trigger`: a post resolved from the overflow trigger that opened the menu.
2. `menu-owner`: a post resolved from the open menu's active element, expanded trigger, or `aria-controls` relationship.
3. `direct`: a post containing the clicked or hovered element.
4. `proximity`: a post selected only by screen coordinates or distance.

Higher-quality fresh context must not be replaced by lower-quality context. Context may be replaced when the new candidate has equal or higher quality, or when the existing context is older than the current context TTL.

## Save-click flow

When the native Save action is clicked:

1. Determine whether the action lives inside a portaled dropdown.
2. Resolve any direct or menu-owner post.
3. Preserve a fresh trigger or menu-owner context.
4. Skip point-based context updates for dropdown menu-item clicks.
5. Use proximity only when no fresh higher-quality context exists.
6. Validate the selected root before calling `LIS.capturePost`.

The capture itself remains synchronous with the existing click flow; no arbitrary timeout or delayed page rescan is introduced.

## Candidate validation

A reliable candidate must contain at least one strong post signal:

- an activity URN or activity ID;
- a recognized feed-post container;
- a post actor plus commentary or a post control-menu trigger.

Reject candidates that are inside comment/composer or image-viewer overlay scopes without a strong post signal. Attachment labels such as `Image in comment shared by <name>` are evidence of an invalid root, not fallback post body.

If validation rejects every candidate, show the existing “couldn't find the post” error and do not POST a capture. A missing capture is preferable to a false author/body record.

## Data and UI boundaries

- Do not change the stored post schema or API.
- Do not change the card header or body renderer.
- Do not infer the author from the phrase `shared by <name>`.
- Do not backfill or rewrite existing bad records.
- Do not introduce server-side LinkedIn fetching.

After deployment, affected records must be deleted and re-saved from LinkedIn.

## Error handling

- Detached remembered elements are ignored.
- Stale contexts older than the existing TTL are ignored.
- A dropdown click cannot overwrite fresh trigger-bound context with proximity context.
- When LinkedIn exposes no trustworthy post root, the extension shows an error and sends no capture.

## Verification

- A native-save regression fixture contains a valid Suprava post, a portaled Save menu, and a competing image/comment overlay with the viewer's identity.
- Opening the post trigger and clicking the portaled Save action resolves the Suprava post.
- The captured payload contains Suprava Sabat, her headline, publication text, and real commentary.
- The captured payload never contains `Egor Dranev` or `Image in comment shared by Suprava Sabat`.
- A test confirms proximity remains available when no trigger or menu-owner context exists.
- A test confirms invalid overlay-only context produces the error path and no capture.
- Existing extraction and native-save tests remain green.
- The extension package rebuild succeeds.
