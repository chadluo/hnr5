# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HNR5 (Hacker News Reader 5) displays Hacker News stories with rich metadata cards and AI-powered summaries. It is a port of the previous version (hnr4, Next.js on Vercel) to TanStack Start deployed on Cloudflare Workers.

## Tech Stack

- **Framework**: TanStack Start (React 19) — file-based routing via `@tanstack/react-router`, no RSC
- **Deployment**: Cloudflare Workers, via `@cloudflare/vite-plugin`
- **Styling**: Tailwind CSS 4
- **AI**: Vercel AI SDK (`ai`) with `@openrouter/ai-sdk-provider` (`openrouter/auto` model)
- **Storage**: Cloudflare KV (binding `CACHE`) for HTML content and tweet caching
- **Content Parsing**: parse5 for metadata extraction (no DOM/JSDOM — regex-based extraction for LLM input)
- **Monitoring**: Sentry via `@sentry/tanstackstart-react` + `@sentry/cloudflare`
- **Package Manager**: pnpm — single package, no workspace (a `pnpm-workspace.yaml` was removed; its presence without a `packages` field breaks `pnpm install --frozen-lockfile` on Cloudflare's build)

## Commands

```bash
pnpm dev              # Dev server on port 3000 (runs against local Workers runtime via workerd)
pnpm build             # Production build (vite build)
pnpm preview            # Build then preview
pnpm deploy             # Build then wrangler deploy
pnpm generate-routes     # Regenerate src/routeTree.gen.ts after adding/removing route files
pnpm cf-typegen          # Regenerate worker-configuration.d.ts from wrangler.jsonc (run after editing wrangler.jsonc)
```

No test framework is configured. Verify changes manually via `pnpm dev` and `pnpm build`.

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
- `getHtmlContent` is also reused inside `src/routes/api/generate.ts` as the HTML fallback when the target page doesn't serve `text/markdown`.

### Content pipeline for AI summaries (`src/routes/api/generate.ts`)

```
POST /api/generate { id, url }
    → try fetching url with Accept: text/markdown (Cloudflare-flavored sites serve this)
    → fallback: getHtmlContent(url) [KV-cached] → regex-strip to plain-ish text (no JSDOM/Readability)
    → streamText() with Output.object(openRouterConfig.schema) via OpenRouter
    → toTextStreamResponse()
```

In dev (`import.meta.env.DEV`), this returns a fake `{ summary: "summary" }` immediately instead of calling OpenRouter.

### Environment / secrets

`src/env.d.ts` augments the ambient `__BaseEnv_Env` interface (declaration-merged with the wrangler-generated `worker-configuration.d.ts`) to type `OPENROUTER_API_KEY` and `SENTRY_DSN`, since these are secrets set via `wrangler secret put` and never appear in `wrangler.jsonc`. Re-run `pnpm cf-typegen` after changing `wrangler.jsonc` bindings — it regenerates `worker-configuration.d.ts` but leaves `src/env.d.ts`'s merge intact.

Client-side Sentry DSN is a separate, non-secret build-time var: `VITE_SENTRY_DSN`.

### Sentry wiring

`wrangler.jsonc`'s `main` points at `src/server.ts` instead of the framework's default `@tanstack/react-start/server-entry`, so the Worker entry point can be wrapped. That file wraps the TanStack request handler with `wrapFetchWithSentry` (from `@sentry/tanstackstart-react`) and then `withSentry` (from `@sentry/cloudflare`, for Workers isolate lifecycle). Global request/function middleware for Sentry is registered separately in `src/start.ts` via `createStart`.

### Blocklist

`src/lib/can_visit.ts` blocks paywalled/unfetchable sites (WSJ, FT, Bloomberg, NYT, Economist, Reuters, Telegraph, WaPo, Reddit) and `.pdf`/`.mp4` URLs. This gates both `Card` metadata fetching and whether the summarize icon (`Dialog.tsx`) is shown at all.
