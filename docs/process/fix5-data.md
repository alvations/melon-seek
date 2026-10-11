# Process log: fix5-data

## 0. Message to the lead (DQ-38, sent first)

> **To: lead. From: fix5-data. DQ-38 is fixed; the uncapped Amazon crawl can start once this commit is integrated.**
> - `server/history.js` `updateLedger`: (1) a listed id the ledger has never seen gets an entry on the run that
>   lists it (`u: 1`, not served by `compactLedger`), so a posting the cap left out keeps that first-seen date;
>   (2) after a partial run (the ledger's new `partial` flag, or `opts.previousPartial` for today's ledgers that
>   predate the flag), a new id whose `postedAt` is not after that run takes its `postedAt`, clamped to the
>   ledger's first and previous runs, as `firstSeenAt` (`b: 1`). A posting posted after the capped run is still
>   new, and a posting with no `postedAt` is first seen now.
> - `.github/scripts/beta-snapshots.mjs` `merge` reads the snapshot it replaces before overwriting it
>   (`previousRunOf`: capped or a short list = partial) and passes it as `crawl.previous`, which
>   `closureOptions` turns into `previousPartial`. `scripts/snapshot.js` `recordPublished` is unchanged (it forwards
>   `crawl`), so no performance-lane patch is needed.
> - Proof: 4 tests in `test/beta-data-check-3.test.js` (the to-do is now plain; plus the legacy-ledger case, the
>   real `merge` command on a capped artifact, and the compact form). On today's Amazon snapshot, a simulated
>   capped run of the newest 2,000 of 5,000 followed by a full run marks **3,000 of 3,000** hidden postings "New"
>   before the fix and **0** after, with either a legacy ledger or a fixed one.
> - Commit: see §7 (first SHA).

## 1. Brief
Prompt: [`docs/process/prompts/fix5-data.md`](prompts/fix5-data.md) (verbatim). Fix wave 5, data lane: the
data-check-beta-3 findings (DQ-33 to DQ-43, DQ-6 residue) and the vetting-beta-2 findings (VT-7, VT-8, VT-10,
VT-14 to VT-25), under the user's rule "we must present them as they are and not cut anything" and the lead's
decisions in `docs/process/lead.md` "Beta round 3". Files owned: `server/**` (not `server/index.js`),
`public/features/shared.js`, `scripts/vet-salaries.js`, `scripts/llm-vet.js`, `data/cities.json`,
`.github/scripts/beta-snapshots.mjs`, the two finding test files, `test/fixtures/**`, and the CONTRACT, VETTING,
DATA_SOURCES and LIVABILITY docs.

## 2. Inputs and sources
(filled in below as the work proceeds)

## 3. Decisions and rationale
1. **DQ-38: date hidden postings by `postedAt`, not by a whole-run baseline.** A baseline run (every new id
   "not new") would also hide the postings that really are new on the uncapped crawl. With `postedAt` (Amazon
   gives a posted date for every posting) only the postings posted before the capped run are dated back; the
   date is clamped to `[since, previous run]` so the ledger never claims to have seen a posting before its
   first run (the browser's `fromCompact` takes `since` as the earliest `firstSeenAt`).
2. **DQ-38: listed-only entries are kept in the ledger file but not served** (`u: 1`, skipped by
   `compactLedger`), so `api/history/<slug>.json` does not grow by the 17,000 ids the cap leaves out.

## 4. Replayable steps
1. `git checkout --detach 3f9385c`; symlink `node_modules`, `data/snapshots`, `data/beta/snapshots`.
2. Baseline `MELON_BETA_SNAPSHOT_DIR=<empty> node --test test/*.test.js`: 1,047 tests, 983 pass, 2 fail (S-6
   methodology re-render in server mode, `server/index.js`, not this lane; PERF-1 timing), 62 to-do.

## 5. Verification
(below)

## 6. Known gaps and follow-ups
(below)

## 7. Change log
- 2026-10-11: DQ-38 fixed and reported (§0).
