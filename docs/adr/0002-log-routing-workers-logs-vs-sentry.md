# 2. Server logs to Workers Logs, client errors to Sentry

Date: 2026-08-29

## Status

Accepted.

## Context

Every `console.*` call in this codebase was carried over directly from the previous
Vercel/Next.js port. On Vercel, the platform overrides the global `console` object to
route output into its own logging product, so no logging helper was ever needed there.
Cloudflare Workers is a different runtime, and Sentry is already wired up separately
(`@sentry/cloudflare` server-side for uncaught exceptions and AI SDK spans,
`@sentry/tanstackstart-react` client-side for browser tracing). Two questions needed
answering before touching any logging code:

1. Does `console.*` need a shared logger to work correctly on Cloudflare, the way it
   implicitly did on Vercel?
2. Should `console.error`/`console.warn` also reach Sentry, and if so, from where?

## Findings

**Cloudflare needs no code change, only a config flag.** Workers Logs captures
`console.*` output at the platform boundary — no override of the `console` global, no
SDK. It requires `wrangler.jsonc`'s `observability.enabled: true`; this repo had it
explicitly set to `false`, so no log reached production regardless of call shape. Once
enabled, a plain-object argument has its fields auto-extracted and indexed
(`console.log({user_id: 123})` becomes filterable by `user_id`) — exactly the shape
already used everywhere in this codebase (`console.error({ storyId, err })`).

**The two Sentry console integrations fit opposite call shapes.** Checked the installed
`@sentry/core@10.69.0` source directly (not just docs) for both:

- `captureConsoleIntegration` (→ Sentry **Issues**, alerting/grouping) only calls
  `captureException` when a top-level console argument is `instanceof Error`. Every
  server-side call here is `console.error({ storyId, err })` — a single plain object, `err`
  nested inside — so it always falls through to `captureMessage(safeJoin(args))`, which
  stringifies the whole object into the message text. Different `storyId`/`url` values
  make every message unique, so Sentry groups nothing: one Issue per field combination,
  and the primary event carries no stack trace (it only survives in `extra.arguments`).
- `consoleLoggingIntegration` (→ Sentry **Logs**, queryable, no alerting) does the
  opposite: it flattens a plain-object argument via `normalize()`, whose
  `convertToPlainObject` special-cases `Error` instances into `{ message, name, stack,
  ...ownProps }`. This is a correct fit for the server's existing call shape — but adds a
  second, paid copy of every log Workers Logs already carries for free, with no alerting
  benefit over it.
- Client-side calls are shaped differently. `Comment.tsx`'s comment-fetch failure path
  (`getHNComment` in `hn.ts`) originally called `console.error(err)` with the `Error` as
  the sole argument — Error-first, exactly what `captureConsoleIntegration` needs for a
  real `captureException` with a correct stack trace and grouping by exception type.

**The two `Sentry.init` calls are already independent.** `server.ts` (Worker) and
`router.tsx` (browser) construct separate SDK instances with separate `integrations`
arrays, so routing them differently costs nothing structural.

## Decision

Split log destinations by side instead of wiring every `console.*` call into both
systems:

- **Server** (`server.ts`): `console.*` goes to Cloudflare Workers Logs only
  (`wrangler.jsonc`'s `observability.enabled: true`). No console-capturing Sentry
  integration is added server-side. Sentry there stays scoped to what it already
  does — uncaught exceptions (`wrapFetchWithSentry`/`withSentry`) and AI SDK spans
  (`vercelAIIntegration`).
- **Client** (`router.tsx`): `Sentry.captureConsoleIntegration({ levels: ["error"] })`
  added. `getHNComment`'s Error-first `console.error` calls become real Sentry Issues.
- **Field names normalized** on the server side to `{ message, ...fields, err }`
  (previously a mix of `err`/`error`, `message`/`result` across files), so Workers Logs
  field extraction is queryable consistently across modules.

## Consequences

**A server-side `console.error` is invisible in Sentry unless it also throws.**
`hn.ts`/`vector.ts`/etc.'s structured error logs are queryable in Workers Logs but
produce no Sentry event on their own. Only an actual uncaught exception or AI SDK
failure reaches Sentry from the server. Deliberate — see Alternatives.

**No shared logger module.** Every file still calls `console.*` directly with a
plain-object literal. Cloudflare already indexes that shape natively, so a wrapper
would add indirection without adding capability.

**Extending server errors into Sentry later is a call-site change, not a config
change.** If server-side alerting is ever wanted, `captureConsoleIntegration` needs
every `console.error({...})` reshaped to `console.error(err, {...})` (Error first) plus
a fingerprint strategy — otherwise every unique field combination becomes its own
ungrouped Issue (see Findings).

**Fixing noise at the source benefits both destinations at once.** `getHNComment`
aborts its fetch on every comment-dialog close; logging that unconditionally would have
flooded both Workers Logs and (via the client integration) Sentry with routine
cancellations. The fix — filtering `AbortError` before logging — lives in `hn.ts` itself,
not in either logging integration, so both sides benefit from one change.

## Alternatives considered

**`consoleLoggingIntegration` (Sentry Logs) server-side, instead of Workers Logs.**
Fits the object-first call shape with no call-site changes (see Findings). Rejected:
duplicates every server log into a second product for no alerting value Workers Logs
doesn't already provide for free.

**`captureConsoleIntegration` server-side, reshaping every call to Error-first.** Would
give real Sentry Issues with grouping. Rejected for now: touches every logging call
site for alerting on failures that are mostly expected and non-actionable at
per-story granularity (a dead link, a cold vector index) rather than incidents. Revisit
if server-side alerting becomes a real need — the fix is call-site reshaping plus a
fingerprint, not a new integration.

**A shared logger module wrapping `console.*`.** The original plan, before confirming
Cloudflare's actual capture mechanism. Dropped once it was clear Cloudflare indexes
plain-object console arguments natively — a wrapper would exist only to standardize
field names, which a smaller mechanical pass across call sites already achieves.
