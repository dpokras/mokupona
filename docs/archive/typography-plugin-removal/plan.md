# Dropping `@tailwindcss/typography` — Plan

Status: **implemented 2026-07-26** via the recommended approach (convert the
route, then drop the plugin). It came out of the CSS-slashing pass on
2026-07-26 that landed `source(".")` (commit `a92497c`); this was the one
remaining big-ticket item from that audit.

Measured result: **72,942 B → 53,748 B raw (−19,194 B, −26.3%)**, **11,729 B →
9,409 B gzip (−2,320 B, −19.8%)** — the predicted landing zone. The emitted
selector diff removed 159 `.prose*` / `.prose-sm*` selectors and nothing else;
the only additions are `.gap-10`, `.list-decimal`, `.pl-5`, and `.space-y-1`
from the new route. The privacy page is **re-typeset** — see "On no design
change" below; it wants an eyeball.

## The finding

`@tailwindcss/typography` is **27% of the entire stylesheet** and it exists to
style **one page**.

Measured against the current `dev` build, by deleting the `@plugin` line and
rebuilding:

| Build              | raw                    | gzip                  |
| ------------------ | ---------------------- | --------------------- |
| current            | 73,253 B               | 11,832 B              |
| without the plugin | 53,639 B               | 9,411 B               |
| **delta**          | **−19,614 B (−26.8%)** | **−2,421 B (−20.5%)** |

That is 121 CSS rules. It ships in the global stylesheet, so every route pays
for it — the home page, the dinner pages, the whole admin surface.

The sole consumer is `app/routes/privacy.mdx:1`:

```jsx
<div className="mx-auto max-w-4xl prose dark:prose-invert prose-sm prose-headings:font-normal pt-8">
```

All four of those classes are genuinely live, which is why the plugin can't
simply be deleted — doing so silently un-styles the privacy policy. Removing
it requires giving that page its own typography first.

## Why the page barely needs it

`prose` ships the full editorial element canon — `figure`, `figcaption`,
`kbd`, `pre`, `code`, `table`, `thead`, `blockquote`, `hr`, `dl`, `img`, lead
paragraphs, and the `:where(…):not(:where([class~=not-prose], …))` guard
wrapped around every one of them.

`privacy.mdx` (222 lines) contains:

| Element                                        | Count |
| ---------------------------------------------- | ----- |
| `h1`                                           | 1     |
| `h2`                                           | 8     |
| `h3`                                           | 27    |
| ordered-list items                             | 23    |
| hard line breaks (two trailing spaces)         | 15    |
| raw JSX block (the postal address, lines 9–22) | 1     |
| paragraphs                                     | many  |

And contains **none** of: links, bold, italic, inline code, code blocks,
tables, blockquotes, bullet lists, images, horizontal rules, footnotes.

So roughly five element types are being styled by a plugin that ships
support for thirty.

## Recommended approach — convert the route, then drop the plugin

`privacy.mdx` is the only `.mdx` file in the repo (`find app -name "*.mdx"`
returns exactly one). It is a static legal document that changes once a year;
the "Last updated" line reads February 5, 2025.

Converting it to a first-party `privacy.tsx` route means the page is typeset
with the site's own type ramp (design system §5) instead of a generic
editorial default, and the plugin, the MDX Rollup plugin, and two
dependencies all leave with it.

### Steps — all done

1. Converted `app/routes/privacy.mdx` → `app/routes/privacy.tsx`. Headings use
   the design-system display ramp (§3: h1 `text-3xl md:text-4xl`, h2
   `text-2xl md:text-3xl`, h3 `text-xl`, all `font-light tracking-tight`),
   paragraphs get `text-foreground/80 text-base leading-relaxed font-light`
   (matching `EventStory`), ordered lists get a single shared `<Ol>`
   treatment. Four local presentational components (`Section`, `Sub`, `P`,
   `Ol`) at the bottom of the file carry the typography so the 220 lines of
   legal text stay readable. Vertical rhythm is `flex flex-col gap-*` rather
   than the plugin's em-based margins. The 15 markdown hard breaks became
   explicit `<br />`; the address block carried over unchanged.
2. Deleted `@plugin "@tailwindcss/typography";` from `app/tailwind.css`.
3. Removed `mdx()` from `vite.config.ts`, dropped `"mdx"` from the
   `tsconfig.json` `types` array, and uninstalled `@mdx-js/rollup`,
   `@types/mdx`, and `@tailwindcss/typography` (−1,828 lock-file lines).
4. Rebuilt: 53,748 B raw / 9,409 B gzip.

Verification run: `typecheck` clean, `lint` clean (3 pre-existing
`import/order` warnings elsewhere), `vitest` 317/317, selector diff as
described above.

### On "no design change"

This is the one item from the CSS audit where that guarantee does **not**
hold, and the plan should be honest about it: the privacy page will be
re-typeset. `prose-sm` has its own type scale, margins, and vertical rhythm
that will not survive the conversion byte-for-byte.

The argument for doing it anyway is that the page is currently the only
surface on the site _not_ using the site's own typography — it is an
un-harmonized island left over from before the design work. Re-typesetting it
brings it into the system rather than away from it. But it is a visual change
on a legal page and wants an eyeball before it lands.

## Alternative, if the page must stay pixel-identical — not taken

Move `@plugin "@tailwindcss/typography";` into a separate CSS file imported
only by the privacy route, so Vite code-splits it into its own chunk. Every
other route stops paying for it while that page renders exactly as it does
today.

This is strictly less good — it keeps the MDX toolchain, keeps the plugin in
`package.json`, and leaves the page as a typographic island — but it is the
zero-risk version, and it captures nearly all of the byte savings for the
routes that matter.

## Verification

Same method used for `a92497c`: build before and after, extract the emitted
selector set from each stylesheet, and diff. The only selectors that should
disappear are `.prose*` and `.dark\:prose-invert*`. Then load `/privacy` and
read it.
