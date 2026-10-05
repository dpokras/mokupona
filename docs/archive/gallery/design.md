# Gallery — image model

Status: **shipped**. The prototype phase (three foundations × three layouts,
built side by side) is over; the join foundation and the mosaic layout won,
and this document records the model that came out of it.

## The model

- **`Image`** is a pure asset primitive: provider metadata only
  (`contentType`, `storageKey`, `version`, `width`/`height`, `blurDataUrl`,
  `altText`), no owner FKs. Back-relations: `event`, `boardMember`,
  `galleryLinks`.
- **`EventGalleryImage (eventId, imageId, caption, position)`** grants one
  image membership in one dinner's gallery — unique on `(eventId, imageId)`,
  Cascade on both sides. The same photo can hang in several dinners.
- **Slot FKs point at the image**: `Event.imageId` (cover) and
  `BoardMember.imageId` (portrait), each `@unique`, `onDelete: SetNull`.

## Where metadata lives

Contextual metadata (`caption`, `position`) lives on the link row, because it
belongs to the pairing: the same photo can read differently under two dinners.
Asset-intrinsic metadata (`altText`, dimensions, blur placeholder) lives on
`Image`, because it is true of the pixels whichever context shows them.

## Delete semantics

**Deleting content releases its images; deleting an asset SetNulls slots and
Cascades links away.** When a dinner, a board member, a slot image (on
replace) or a gallery membership goes, each image it referenced is checked
against the reference registry: an image nothing else references — no cover
slot, no portrait slot, no gallery membership — is deleted, row and provider
asset together; an image anything still references stays untouched
(`releaseImagesIfUnreferenced`, `app/models/image.server.ts`). In the other
direction, deleting an image row leaves the dinner and the member standing
(their slots go null) and takes only the gallery memberships with it.

## Guardrails

- The `IMAGE_REFERENCE_SITES` registry (`app/models/image.server.ts`) is the
  one list of relations that count as an image being in use;
  `releaseImagesIfUnreferenced` derives its precondition from it.
- A completeness test (`app/models/image.server.test.ts`) checks the registry
  against the generated client's data model: a new relation targeting `Image`
  (say, a future `RecipeImage`) fails CI until the registry — and with it the
  cleanup logic — learns about it.

## Open seams

Two seams are deliberate: undecided design questions, not TODOs.

### Orphaned-image lifecycle

`releaseImagesIfUnreferenced` (`app/models/image.server.ts`) deletes an image
on last-unlink when nothing else uses it, and the caller destroys the provider
asset. The alternative is a pool/sweep model: unlinked images rest in a pool
and a periodic sweep collects them after an upload grace window. Undecided —
delete-on-last-unlink stands until the pool earns its keep.

### Standalone collections

Galleries that are not about a dinner were dropped with the album prototype.
They could return as a new link table next to `EventGalleryImage`; the seam
kept open for it is `GalleryImageModel.event` staying nullable
(`app/features/gallery/view-models.ts`).
