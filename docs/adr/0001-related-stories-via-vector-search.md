# 1. Related stories via vector search

Date: 2026-08-11

## Status

Accepted.

## Context

The app shows one AI summary per story. We wanted a story page to also surface other
relevant stories, specifically catching **cross-vocabulary** matches that keyword search
misses — "Rust rewrite of X" and "memory-safe reimplementation of X".

Hacker News already has a keyword index (Algolia), and querying it with the story title
is far less work than owning a vector index. So embeddings had to earn their place. The
question was measurable: does cosine similarity rank *genuinely* related HN stories above
unrelated ones, reliably enough to render without a human in the loop?

`experiments/related.mjs` answered it offline — no bindings, no Vectorize, no app code.

## Findings

**Run 1 — 128 stories, one day.** All three candidate inputs failed. Median top-1 score
0.64–0.70 with only 0.037–0.046 separating rank 1 from rank 5. Generic AI-commentary posts
became everyone's nearest neighbour (one appeared in 7 of 20 sampled top-5 lists) because
they sit near the centroid of a corpus that was ~60% AI stories. No score threshold could
separate good matches from bad: a junk match scored 0.599 while a genuinely coherent
civil-liberties cluster scored 0.642–0.655.

**Run 2 — 553 stories, 14 days.** The conclusion reversed, because a one-day corpus
contains almost no true relatives, so the top of the score distribution was necessarily
noise. Fourteen days contains what HN relatedness actually consists of: reposts,
retractions, follow-ups, same-event coverage, product-family news.

Measured over 152,628 pairs with `title\nsummary` embeddings:

| | value |
|---|---|
| Unrelated pairs, p50 | 0.524 |
| Unrelated pairs, p99.9 | 0.733 |
| Genuinely related pairs | 0.80 – 0.97 |
| Pairs clearing 0.80 | 37 of 152,628 (0.024%) |
| Precision at ≥0.80, judged by hand | ~33 of 37 (~90%) |
| Precision at ≥0.85 | 11 of 12 |

Input comparison:

- **Title only — rejected.** A known repost (same URL, retitled) scored 0.698 with 711
  unrelated pairs above it. Retitled submissions are not lexically similar.
- **Article body (first 2000 chars) — rejected.** Best at exact duplicates (1.000 on
  identical text) but produced *ICE body cam video* ↔ *France bans telemarketing* at 0.852
  and *Blackwing Pencils* ↔ *70% of AI revenue* at 0.726, matching page furniture. Coverage
  collapses to 2.5% at ≥0.85.
- **Title + LLM summary — chosen.** Best precision and the only input that produced the
  cross-vocabulary matches we wanted: *Claude moves bound of the Riemann Hypothesis* ↔
  *Learning more about Claude's mathematical capabilities* (0.886), *How Claude marks
  AI-generated content* ↔ *EU enforces labeling AI generated content* (0.820). The LLM
  normalises vocabulary before the embedding ever sees the text, which is why this works
  and raw body text does not.

A note on method: run 2's first pass produced a false negative. Its ground-truth labels
came from same-URL detection, but URL normalisation stripped query strings, so five
unrelated `youtube.com/watch?v=…` videos were labelled "related" and dragged the
true-pair minimum to 0.447. The unit test now asserts distinct video IDs stay distinct.

## Decision

Index story embeddings in Cloudflare Vectorize and show up to 3 related stories on the
story page, only above a cosine score of 0.80.

- **Embedding**: Workers AI `@cf/baai/bge-base-en-v1.5` (768 dimensions, verified) over
  `title\nsummary`.
- **Index**: `hnr5-stories`, 768 dimensions, cosine. Both immutable after creation.
- **Threshold**: 0.80, in `src/lib/related.ts`. This number is only valid for this model,
  this input text, and cosine distance. Changing any of them requires re-running
  `experiments/related.mjs`.
- **Write path**: `getStoryData` fires `indexStoryInBackground` for card-kind stories, so
  the index fills from ordinary traffic (~30 top + 30 best per render, deduped). No
  crawler. Guarded by a KV marker `vec:{id}` so a story costs one summary and one
  embedding total, not one per render. `waitUntil` keeps it off the streaming path.
- **Read path**: `queryById`, not a fresh embedding. The vector is already in the index,
  so this is one index read with no Workers AI call.
- **Summaries move server-side.** `/api/generate` only summarises on click and persists
  nothing, so it cannot feed an index. `getSummary` generates and caches to KV under
  `summary:{id}` for every indexed story.

## Consequences

**Accepted: low recall.** About 10% of stories have any match above 0.80; ~4% at 0.85. Nine
stories in ten show nothing. This is deliberate — the run-1 data shows a lower bar
produces confident-looking noise, which is worse than an absent feature.

**A 30-day window is sufficient.** HN relatedness is time-local, so this needs no
historical backfill and no full-archive index.

**New cost on the render path.** The front page now triggers OpenRouter calls it never made
before — bounded to roughly 60 new stories/day by the KV marker, but no longer zero.

**`pnpm dev` requires the index to exist.** Neither Vectorize nor Workers AI has local
simulation, so both bindings are `remote: true`. Without the index, dev fails to boot with
`code: 10159`. Dev reads the production index and never writes to it, because dev
summaries are fake (`import.meta.env.DEV`) and embedding them would poison the index.

**Two summaries per story can differ.** The click path streams its own summary and does not
read the KV cache, so a story may have a stored summary and a freshly generated one that
differ in wording. Only the stored one affects search. Wiring `/api/generate` to serve the
cache would fix this and remove a duplicate LLM call, but changes the streaming UX, so it
was left out.

**A cast is required.** `wrangler types` types `vectorize` bindings as the deprecated V1
`VectorizeIndex`, which lacks `queryById`. `src/lib/vector.ts` narrows to V2 in one place.

## Alternatives considered

**Algolia keyword search.** Zero infrastructure, covers all of HN, and it wins the one case
embeddings clearly won in run 1 (*Tail-Call Interpreters in Rust* ↔ *Tail-call optimization
in C*, 0.79 — a literal token match). Rejected because it cannot make the
cross-vocabulary matches that motivated the feature. Still the right fallback if the index
proves not worth its upkeep.

**Algolia candidates, embedding rerank.** No index to own. Would have avoided the hub
problem, but run 2 showed a plain index works and this needs two upstream calls per view.

**Threshold at 0.70** (the initial instinct). Measured wrong: it admits 455 pairs instead of
37, and the 0.70–0.80 band is exactly where unrelated pairs live (p99.9 = 0.733). It would
have kept *Blackwing Pencils* ↔ *AI revenue* and dropped every good cluster below 0.70.
