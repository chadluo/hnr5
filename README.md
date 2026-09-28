# HNR5

Hacker News reader with metadata cards and AI summaries. It runs on TanStack Start and
Cloudflare Workers.

## Run locally

1. Install [mise](https://mise.jdx.dev/). Then install the pinned Node and pnpm from
   `mise.toml`:

   ```bash
   mise trust
   mise install
   ```

2. Install the dependencies:

   ```bash
   pnpm install
   ```

3. Log in to Cloudflare. The `AI` and `VECTORIZE` bindings always use your real
   account, also in dev:

   ```bash
   pnpm exec wrangler login
   ```

4. Create the Vectorize index one time for each account. If the index is missing,
   `pnpm dev` fails with `code: 10159`:

   ```bash
   pnpm exec wrangler vectorize create hnr5-stories --dimensions=768 --metric=cosine
   pnpm exec wrangler vectorize create-metadata-index hnr5-stories --propertyName=at --type=number
   ```

5. Create `.env`. Wrangler and Vite load it in dev. The PostHog values are required:
   dev throws an error without them. The other values are optional, because dev
   summaries are fake and Sentry stays off without a DSN.

   ```bash
   VITE_PUBLIC_POSTHOG_PROJECT_TOKEN=...   # required
   VITE_PUBLIC_POSTHOG_HOST=...            # required
   OPENROUTER_API_KEY=...                  # optional
   SENTRY_DSN=...                          # optional
   VITE_SENTRY_DSN=...                     # optional
   ```

6. Start the dev server on <http://localhost:3000>:

   ```bash
   pnpm dev
   ```

## Troubleshooting

- `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, or a warning that the `pnpm` field is ignored:
  you use pnpm 11 or later. Run `mise install`, then run `pnpm -v` and make sure it shows
  10.x.
- SSR error `Cannot read properties of null (reading 'useContext')`, or
  `file does not exist ... deps_ssr`: the Vite dependency cache is stale. Stop all dev
  servers, run `rm -rf node_modules/.vite`, and start again.

## Checks

```bash
pnpm exec tsc --noEmit
pnpm build
node --test src/lib/*.test.ts
```

## Deploy

Pushes to `main` deploy through Cloudflare Workers Builds. `CLAUDE.md` has the
architecture and deployment details.
