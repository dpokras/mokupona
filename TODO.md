# moku pona — feature backlog

Tracked by hand. Check a box and date it when a task actually ships (not just started). Don't start implementing anything here without an explicit go-ahead — this file is the queue, not a work order.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done

---

## 1. Admin hub at `/admin` — do everything admin-related there

Already exists (`app/routes/admin*.tsx`): dinners CRUD, locations, board members, users, auth-toggle settings, per-dinner signups + CSV export, per-dinner gallery upload. So this is "extend the existing admin area", not greenfield.

- [x] 1.1 Create dinners — **done already** (`admin.dinners.new.tsx`, `admin.dinners.$dinnerId.edit.tsx`)
- [~] 1.2 Monitor guests — signups list per dinner exists; add a cross-dinner guest view (search/filter by person across all dinners, attendance history). _built on `claude/todo-list-9o8zmr`, not deployed yet: `/admin/guests` with search, filters, CSV export and a page per guest._
- [~] 1.3 Upload images for dinners and other sub-sites — per-dinner gallery upload exists; extend to non-dinner surfaces (about page volunteer photos, hero/title-card images via CMS blocks). _built on `claude/todo-list-9o8zmr`, not deployed yet: `/admin/content/images` with a link-preview image and an about page photo; more slots are one entry in `image-slots.ts`._
- [~] 1.4 Monitor visits — nothing exists yet. Needs a privacy-friendly analytics approach (self-hosted/Plausible-style or simple server-side pageview log) — avoid Google Analytics for Swiss/EU privacy reasons. _built on `claude/todo-list-9o8zmr`, not deployed yet: cookieless counter, `/admin/visits` dashboard, described in the privacy policy._
- [ ] 1.5 Manage a mailing list (postponed, not part of the admin hub pass) — nothing exists yet. Needs: subscriber model, opt-in/opt-out (double opt-in for compliance), admin UI to view/export/segment, send-to-list action
- [ ] 1.6 Manage bookings for each dinner — signups view exists; may need booking status (confirmed/waitlisted/cancelled) once Stripe (#5) lands (waits for #5)
- [~] 1.7 Other admin needs identified below: Impressum/FAQ/string editor (#2, #3, #6) all live under `/admin` too. _built on `claude/todo-list-9o8zmr`, not deployed yet: everything sits under `/admin/content`; account and log out moved into the admin tab bar._

## 2. Impressum page

- [~] Swiss legal requirement (Art. 3 UWG / imprint duty) — needs org name, address, contact, UID/commercial register no. if applicable. _built on `claude/todo-list-9o8zmr`, not deployed yet; defaults copied from the privacy policy, fill in the responsible person and UID under Site content, Impressum._
- [~] New route, likely sibling to `privacy.tsx` (`app/routes/impressum.tsx`), linked from footer

## 3. Improve gallery page

- [ ] **Needs clarification before starting — ask Daniel what specifically and how** (current state, desired changes, which gallery: public `gallery.tsx`, per-dinner `dinners_.$dinnerId_.gallery.tsx`, or admin upload flow)

## 4. FAQ page, editable from admin panel

- [~] New public route (`app/routes/faq.tsx`). _built on `claude/todo-list-9o8zmr`, not deployed yet; production starts empty, use "Add starter questions" in the admin._
- [~] Content model: list of question/answer entries, ordered, admin CRUD — likely fits the existing CMS block pattern (`app/features/cms/blocks`) or a dedicated `faq-entry` model
- [~] Ties into #6 (everything editable from admin)

## 5. Stripe payments (+ TWINT) — later

- [ ] Account email: `mokuponadinnerclub@gmail.com`
- [ ] Stripe Checkout or Payment Element; TWINT via Stripe's TWINT payment method (CH-specific, needs CHF settlement)
- [ ] Decide how paid bookings interact with existing signup/waitlist flow and the CSV export
- [ ] Refund/cancellation handling
- [ ] Explicitly deferred — do not start without a separate go-ahead

## 6. Admin-editable public-facing strings, category-based

- [~] Audit every public string (landing, `/dinners`, `/about`, `/privacy`, impressum, FAQ, nav, footer, emails). _built on `claude/todo-list-9o8zmr`, not deployed yet: all of them live in `app/features/site-content/catalog/`, em dashes are rejected._
- [~] Category-based editor UI (About, FAQ, Impressum, Landing, Footer, Emails, …) — likely the natural home/extension for `app/features/cms`
- [~] Decide storage: structured per-field rows vs. rich-text blocks (decided: one `SiteText` row per edited entry, defaults stay in code; long texts use a small markdown-like format) (CMS blocks already do hero/image/text-section/title-card — may extend that model rather than inventing a new one)
- [ ] Versioning/preview before publish would be nice-to-have, not required for v1

## 7. About page — volunteers, board members, who we are

- [ ] `app/routes/about.tsx` already exists — check current content before rewriting
- [ ] Board members already modeled (`board-member.server.ts`, admin CRUD exists) — surface them with photos on the About page
- [ ] Volunteers are not currently modeled — needs a volunteer entity (or extend board-member model) with photo + bio, managed from admin

## 8. Email sending/receiving on the real domain

- [ ] Resend is already integrated (`app/features/mail/providers/resend.server.ts`, `MAIL_PROVIDER=resend`, `MAIL_FROM` defaults to `moku pona <no-reply@mail.mokupona.ch>`) — confirm domain/DNS (SPF/DKIM) is verified in Resend for `mokupona.ch`
- [ ] Outbound: `noreply@mokupona.ch` for guest-facing transactional mail (already close to this via `MAIL_FROM`)
- [ ] Inbound + aliasing via improvmx.com, pointed at the `mokuponadinnerclub@gmail.com` Gmail account, to get `contact@mokupona.ch`, `support@mokupona.ch` etc. forwarding into Gmail, with Gmail "send as" configured so replies go out under those addresses
- [ ] This is mostly DNS/third-party config (improvmx + Gmail + Resend domain), not app code — document the setup once done (`docs/` seems like the right place, e.g. `docs/email-domain-setup/`)

## 9. Cloudinary (or Cloudflare) image storage — later

- [ ] A Cloudinary provider already exists (`app/features/images/providers/cloudinary.server.ts`) alongside local storage — likely just needs enabling/configuring (API keys, env vars) rather than building from scratch
- [ ] Decide Cloudinary vs. Cloudflare Images/R2 — Cloudinary already has a working provider, so that's the path of least resistance unless there's a cost/feature reason to switch
- [ ] Explicitly deferred — do not start without a separate go-ahead

## 10. Password-protected per-dinner guest site + follow-up email with photos

- [ ] A guest-facing, authenticated (but lightweight — not full account signup) page scoped to one dinner's attendee list
- [ ] Access likely via a signed/expiring link emailed post-event (reuse the existing invite-token pattern — `invite.server.ts`, `invite.$token.tsx` already does tokenized access elsewhere)
- [ ] Admin action: "send photos" email to that dinner's attendees once gallery images are uploaded
- [ ] Depends on gallery (#3) and mailing (#8) being in good shape first

## 11. "Secret" recipes site — future, shareable on request

- [ ] Separate, low-priority — a gated or obscure-URL section for recipes, with a way to share a specific recipe link with outsiders on request
- [ ] No model/route exists yet; lowest priority on this list

## 12. Guest sign-ups and accounts

- [ ] Login, account and logout links are gone from the public site; `/admin` is the only way in. The public self sign-up page (`/join`) is no longer linked anywhere but still works. Decide whether guests should have accounts at all, and close or repurpose `/join` accordingly (the admin settings page can already switch email sign-ups off).

## 13. Follow-ups found while building the admin hub

- [ ] CSV exports (per-dinner signups, all guests) don't guard against spreadsheet formula injection: names come from the public form, so a value starting with `=`, `+`, `-` or `@` could run as a formula in Excel. Careful: phone numbers start with `+`.

---

## Additional ideas worth considering (not yet approved — just flagging)

- **Dietary restrictions / allergies field** on the signup form, surfaced to admins per dinner — useful before a Stripe-paid booking makes cancellations costlier
- **Waitlist flow** for full dinners, with auto-promote-and-notify when a seat frees up (pairs naturally with #6 bookings and #5 payments)
- **Pre-event reminder email** (e.g. 24–48h before) and **post-event thank-you/feedback email** — both fit the existing mail feature and templates
- **Calendar (.ics) download / "Add to calendar"** on the dinner page
- **German/English bilingual content** — Zurich audience; ties directly into #6's string editor, so worth deciding the i18n approach before building the editor rather than after
- **Simple audit log** for admin actions (who created/edited/deleted what) — cheap now, painful to retrofit once multiple admins are editing content and bookings
- **Social/OG polish per page** (impressum, FAQ, about already need `meta` exports like other routes)
- **Sitemap.xml + robots** now that the public surface is growing (landing, dinners, about, FAQ, impressum, privacy)
- **Member/volunteer-only internal page** separate from the admin area, for things like the recipe site (#11) or event planning notes — could share infrastructure with #10's password-protected guest pages

---

## Notes

- Don't start work on any of these without explicit go-ahead per task.
- When a task starts, flip its box to `[~]`; when it ships, flip to `[x]` and add the date, e.g. `[x] 2026-10-05`.
- See [CLAUDE.md](CLAUDE.md) for repo/stack context.
