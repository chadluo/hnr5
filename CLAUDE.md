# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HNR5 (Hacker News Reader 5) displays Hacker News stories with rich metadata cards and AI-powered summaries. It is a port of the previous version (hnr4, Next.js on Vercel) to TanStack Start deployed on Cloudflare Workers.

## Tech Stack

- **Framework**: TanStack Start (React 19) — file-based routing via `@tanstack/react-router`, no RSC
- **Deployment**: Cloudflare Workers, via `@cloudflare/vite-plugin`
- **Styling**: Tailwind CSS 4
- **AI**: Vercel AI SDK (`ai`) with `@openrouter/ai-sdk-provider` (`openrouter/auto` model)
- **Storage**: Cloudflare KV (binding `CACHE`) for HTML content, summary, and tweet caching; Cloudflare Vectorize (binding `VECTORIZE`) for story embeddings
- **Embeddings**: Workers AI (binding `AI`), `@cf/baai/bge-base-en-v1.5`
- **Content Parsing**: parse5 for metadata extraction (no DOM/JSDOM — regex-based extraction for LLM input)
- **Monitoring**: Sentry via `@sentry/tanstackstart-react` + `@sentry/cloudflare`
- **Package Manager**: pnpm 10, single package. Keep `pnpm.onlyBuiltDependencies` in `package.json`; do not add `pnpm-workspace.yaml`.
- **Toolchain**: `mise.toml` pins Node 24 and pnpm 10. Do not change pnpm to `latest`: pnpm 11+ ignores the `pnpm` field in `package.json` and rejects packages published less than a day ago.

## Commands

First-time setup is in `README.md`.

```bash
pnpm dev              # Dev server on port 3000 (runs against local Workers runtime via workerd)
pnpm build             # Production build (vite build)
pnpm preview            # Build then preview
pnpm deploy             # Build then wrangler deploy
pnpm generate-routes     # Regenerate src/routeTree.gen.ts after adding/removing route files
pnpm cf-typegen          # Regenerate worker-configuration.d.ts from wrangler.jsonc (run after editing wrangler.jsonc)
```

For code changes, run `pnpm exec tsc --noEmit`, `pnpm build`, and
`node --test src/lib/*.test.ts`. Use `pnpm dev` for browser checks.

**CI/CD**: Pushes to `main` auto-deploy through Cloudflare Workers Builds, configured in
the dashboard. Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` as build
variables there. Use `pnpm deploy` only for a local deployment before a push.

`pnpm dev` requires the Vectorize index to exist (see Related stories below) — the
`VECTORIZE` binding is remote-only, so a missing index fails startup with `code: 10159`.

## Architecture

### Streaming per-story cards

TanStack Start has no React Server Components, so per-card streaming is done with **deferred loader promises + `<Await>`**:

- Each route (`index.tsx`, `best.tsx`, `story.$slug.tsx`) loader calls `getStoryData({ data: storyId })` — a `createServerFn` — for every story **without awaiting**, and returns the array of unresolved promises as loader data.
- `<Story promise={...}>` (`src/components/Story.tsx`) wraps each one in `<Await fallback={<StoryPlaceholder />}>`, so cards stream in and resolve independently as their server-side fetches complete.
- `src/server/story.ts` (`getStoryData`) does the actual dispatch: fetches the HN item, then decides tweet embed / YouTube embed / metadata card, fetching whatever each branch needs (tweet data or HTML+meta).

### Server functions vs. server routes

- `createServerFn` (`src/server/story.ts`) is used for data consumed only by route loaders — it's an RPC call, not a real HTTP endpoint.
- `src/routes/api/generate.ts` is a **server route** (`server.handlers.POST`), not a server function, because `@ai-sdk/react`'s `useObject` needs to POST to a real HTTP path (`/api/generate`) and stream a `Response`.

### Caching

- `src/lib/contents.ts` (`getHtmlContent`) and `src/lib/tweet.ts` (`getCachedTweet`) both read/write the `CACHE` KV binding directly via `env` from `cloudflare:workers`.
- HTML content: 1 hour TTL. Tweet data: 24 hour TTL.
- `getHtmlContent` is reused inside `getPageText` (`src/lib/contents.ts`) as the HTML fallback when the target page doesn't serve `text/markdown`.
- `src/lib/summary.ts` writes generated summaries to the same binding under `summary:{id}`, with no TTL.

### Content pipeline for AI summaries (`getPageText`, `src/lib/contents.ts`)

Owned by `getPageText`, not the route — both `/api/generate` and `src/lib/summary.ts` call it, so the streamed summary and the indexed one see identical input.

```text
POST /api/generate { id, url }
    → getPageText(url)
        → canVisit(url) gate — blocked hosts and .pdf/.mp4 never hit the network
        → try fetching url with Accept: text/markdown (Cloudflare-flavored sites serve this)
        → fallback: getHtmlContent(url) [KV-cached] → regex-strip to plain-ish text (no JSDOM/Readability)
        → truncate to MAX_PROMPT_CHARS (24000) — an oversized page is rejected by
          OpenRouter, and indexStory would then retry it on every render
    → streamText() with Output.object(openRouterConfig.schema) via OpenRouter
    → toTextStreamResponse()
```

In dev (`import.meta.env.DEV`), this returns a fake `{ summary: "summary" }` immediately instead of calling OpenRouter.

### Related stories (semantic search)

See `docs/adr/0001-related-stories-via-vector-search.md` for the calibration data behind
the numbers below. Requires a one-time setup:

```bash
wrangler vectorize create hnr5-stories --dimensions=768 --metric=cosine
wrangler vectorize create-metadata-index hnr5-stories --propertyName=at --type=number
```

Dimensions and metric are immutable, and the metadata index cannot be backfilled — it must
exist before the first upsert.

- **Write path**: `getStoryData` schedules card indexing with `waitUntil`. The `vec:{id}`
  KV marker prevents repeat summary and embedding work. Dev skips indexing because its
  summaries are fake.
- **Read path**: `getRelatedStories` (`src/server/related.ts`) → `queryRelated` uses
  Vectorize `queryById`, so no embedding call happens at read time. `<Related>`
  (`src/components/Related.tsx`) calls it from the client when the summary/comments
  dialog opens, and renders under the summary — so the links reach every list page,
  not just `/story/{id}`.
- **Threshold**: `MIN_SCORE = 0.8` in `src/lib/related.ts`, calibrated over 553 stories.
  Unrelated pairs top out at ~0.73; related pairs run 0.80–0.97. **Only valid for this
  model, cosine distance, and `title\nsummary` as the embedded text** — re-run
  `experiments/related.mjs` if any of those change. Roughly 10% of stories have any match
  above it, so rendering nothing is the normal case.
- **Summaries** are generated server-side and KV-cached under `summary:{id}` by
  `src/lib/summary.ts`, since `/api/generate` only summarises on click and persists
  nothing. Both share `summarySystemPrompt` and `getPageText`.

### Environment / secrets

`src/env.d.ts` adds secret-only bindings (`OPENROUTER_API_KEY` and `SENTRY_DSN`) to the
generated environment types. Run `pnpm cf-typegen` after `wrangler.jsonc` binding changes,
not after secret changes.

Client-side Sentry DSN is a separate, non-secret build-time var: `VITE_SENTRY_DSN`.

### Sentry wiring

`wrangler.jsonc`'s `main` points at `src/server.ts` instead of the framework's default `@tanstack/react-start/server-entry`, so the Worker entry point can be wrapped. That file wraps the TanStack request handler with `wrapFetchWithSentry` (from `@sentry/tanstackstart-react`) and then `withSentry` (from `@sentry/cloudflare`, for Workers isolate lifecycle). Global request/function middleware for Sentry is registered separately in `src/start.ts` via `createStart`.

Sentry 11 removed the `/nodejs_compat` entrypoint and the `enableLogs` option; the root export's `vercelAIIntegration()` listens on `node:diagnostics_channel` for AI SDK v7, and logs are always on. Cloudflare cannot patch call sites, so **every `generateText`/`streamText` call must pass `experimental_telemetry: { isEnabled: true }`** or it produces no AI spans — currently `src/lib/summary.ts` and `src/routes/api/generate.ts`.

Source maps are uploaded to Sentry by `sentryVitePlugin` in `vite.config.ts`, which also stamps the release. It is skipped unless `SENTRY_AUTH_TOKEN` is set, so local builds are unaffected; the Cloudflare build needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` as **build** variables. `upload_source_maps` in `wrangler.jsonc` is separate — it feeds Cloudflare's own dashboard, not Sentry.

### Blocklist

`src/lib/can_visit.ts` blocks paywalled/unfetchable sites (WSJ, FT, Bloomberg, NYT, Economist, Reuters, Telegraph, WaPo, Reddit) and `.pdf`/`.mp4` URLs. This gates both `Card` metadata fetching and whether the summarize icon (`Dialog.tsx`) is shown at all.
