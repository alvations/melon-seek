# melon-seek data archive (machine-maintained)

Permanent, append-only and lossless history of every job posting version (full text
included, deduplicated by content), company aggregate, cross-company comparison,
reference dataset (FX, rents, cost index, tax tables, policy constants), salary-vetting
audit record and F4 ledger entry that melon-seek has seen. This branch, not any workflow
artifact and not the F4 ledger, is the system of record.

- Written only by `.github/workflows/archive.yml` and `archive-backfill.yml`
  (scripts/archive/ on the code branch). Never edited by hand, never force-pushed,
  never merged into the code branch.
- Layout, schema (MANIFEST.json `schemaVersion`), migrations, restore and size
  projections: docs/DATA_ARCHIVE.md on the code branch.
- Integrity: `node scripts/archive/verify.js --archive <this checkout>`.
- Any observed snapshot: `node scripts/archive/reconstruct.js --archive <this checkout> --company <slug> --date <YYYY-MM-DD>`.
- F4 listing ledger: `history/<slug>.json` (stable) and `beta/history/<slug>.json`, the
  same layout .github/scripts/ledger.sh reads in branch mode; or
  `node scripts/archive/restore.js --archive <this checkout> --out data/history`.
