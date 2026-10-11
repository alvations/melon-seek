# Process log: perf-mobile-beta

## 1. Brief

Prompt: [prompts/perf-mobile-beta.md](prompts/perf-mobile-beta.md), verbatim, with the lead's notes of 2026-10-11.

Goal: measure load time, main-thread blocking and memory on a mid-range phone for the beta site
(`/melon-seek/beta/`, the big-tech boards), then fix the biggest costs, simply and with identical output.

Status: baseline measured (this commit). Optimizations and the before/after table follow.

## Baseline (2026-10-11, build at 0ce5280)

4x CPU, 390×844, `scripts/cycle/serve.mjs` (HTTP/1.1, gzip, `max-age=600`), one run per cell, load
average 0.2-1.6 during the matrix. Harness: `docs/process/scripts/perf-mobile-beta.mjs`.

| Network · company | FCP | First card | First chart | TTI | Max task | TBT | Heap | Warm first chart | Switch away / back |
|---|---|---|---|---|---|---|---|---|---|
| Fast 4G · Apple | 860 ms | 6.1 s | 6.8 s | 7.2 s | 815 ms | 2.9 s | 17.4 MB | 4.9 s | 2.8 s / 1.2 s |
| Fast 4G · Google | 832 ms | 5.5 s | 5.9 s | 6.4 s | 660 ms | 2.4 s | 16 MB | 4.2 s | 3.2 s / 1.1 s |
| Fast 4G · NVIDIA | 744 ms | 4.7 s | 5.1 s | 5.5 s | 613 ms | 2.0 s | 14.6 MB | 3.3 s | 3.4 s / 991 ms |
| Fast 4G · Microsoft | 828 ms | 4.3 s | 4.7 s | 4.9 s | 601 ms | 1.8 s | 14.9 MB | 3.3 s | 4.0 s / 985 ms |
| Fast 4G · Netflix | 808 ms | 3.4 s | 3.6 s | 3.8 s | 415 ms | 1.1 s | 8.9 MB | 2.0 s | 4.7 s / 541 ms |
| Fast 4G · Anduril | 776 ms | 4.5 s | 5.0 s | 5.5 s | 563 ms | 1.9 s | 12.9 MB | 3.4 s | 4.0 s / 839 ms |
| Slow 4G · Apple | 1.7 s | 10.2 s | 10.5 s | 10.7 s | 797 ms | 2.5 s | 17.4 MB | 4.9 s | 3.9 s / 1.1 s |
| Slow 4G · Google | 1.7 s | 9.4 s | 9.7 s | 9.8 s | 726 ms | 2.2 s | 14.7 MB | 4.3 s | 3.9 s / 1.1 s |
| Slow 4G · NVIDIA | 1.8 s | 8.3 s | 8.5 s | 9.7 s | 601 ms | 1.9 s | 15.5 MB | 2.9 s | 5.2 s / 887 ms |
| Slow 4G · Microsoft | 1.8 s | 8.3 s | 8.6 s | 9.8 s | 722 ms | 2.1 s | 13.7 MB | 3.1 s | 6.4 s / 970 ms |
| Slow 4G · Netflix | 1.8 s | 7.9 s | 8.3 s | 9.4 s | 563 ms | 1.4 s | 9 MB | 2.0 s | 6.7 s / 710 ms |
| Slow 4G · Anduril | 1.8 s | 8.4 s | 8.9 s | 10.1 s | 550 ms | 2.1 s | 16.1 MB | 3.5 s | 6.0 s / 901 ms |

Where Apple's 6.1 s (Fast 4G) goes, from the trace and CPU profile: the list request starts only at
1.86 s (after app.js and its imports run); parse 0.30 s; unpack 0.19 s; vetSalaries 0.19 s; Juice
0.5 s; app.js `prepare` 2.0 s (`roleFamily` 1.2 s of it); first render 0.78 s; chart 0.3 s.
