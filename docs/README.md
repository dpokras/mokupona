# docs/

One subfolder per initiative/investigation. Check here first for prior art before starting something that sounds like it might have history.

## Active reference

These describe standing conventions or still-relevant specs, not closed projects:

- `data-access-layer/` — the data-access-layer pattern, enforced live via an ESLint rule (`no-restricted-imports` in `eslint.config.js`)
- `database-backups/` — nightly backup/restore runbook (NAS pull), includes the `nas-backup.sh` script
- `design-harmonization/` — design system spec (`design-system-spec.md`) synced to the Claude Design project; audit/spec phases are done, but applying it to component code ("code convergence") is still outstanding — see `plan.md`
- `route-module-conventions/` — house rules for route modules (`conventions.md`); the companion cleanup pass (`action-plan.md`) is fully done

## `archive/`

Shipped initiatives and closed-out investigations, kept for historical context. Not maintained going forward. Includes two that never shipped and aren't tracked in `TODO.md` — `forms-decoupling` (proposed, never started) and `dinner-form-redesign` (looks abandoned, references a `tmp/` dir that no longer exists) — resurrect from `TODO.md` or a fresh doc if either becomes relevant again.
