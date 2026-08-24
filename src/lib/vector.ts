import { env, waitUntil } from "cloudflare:workers";
import type { HNStory } from "./hn";
import { MAX_RELATED, embedInput, pickRelated, type RelatedStory } from "./related";
import { getSummary } from "./summary";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

/** +1 because a story is always its own top match and gets filtered out. */
const QUERY_TOP_K = MAX_RELATED + 1;

/**
 * `wrangler types` still types `vectorize` bindings as the deprecated V1
 * `VectorizeIndex`, which has no `queryById`. The index is V2 (created with
 * --dimensions/--metric), so narrow it once here instead of casting at each call.
 */
const index = () => env.VECTORIZE as unknown as Vectorize;

/** Workers AI returns either embeddings or an async-request handle; only the former is usable. */
const embedOne = async (text: string) => {
  const output = await env.AI.run(EMBEDDING_MODEL, { text: [text] });
  return "data" in output ? output.data?.[0] : undefined;
};

/**
 * Related stories for one story.
 *
 * Uses `queryById` rather than re-embedding at read time: the vector is already in the
 * index, so this is a single index read with no Workers AI call. It also means
 * `pnpm dev` returns real results against the production index without ever embedding
 * the fake dev summary.
 */
export const queryRelated = async (storyId: number): Promise<RelatedStory[]> => {
  try {
    const result = await index().queryById(String(storyId), {
      topK: QUERY_TOP_K,
      returnMetadata: "all",
    });
    return pickRelated(result?.matches ?? [], storyId);
  } catch (err) {
    // A story with no vector yet — the common case on a cold index — is
    // indistinguishable from a real failure here. Neither should break the page.
    console.error({ message: "Cannot get related stories", storyId, err });
    return [];
  }
};

/**
 * True for URLs `getStoryData` (`src/server/story.ts`) renders as a metadata card —
 * false for tweet/YouTube embeds, which it dispatches on separately and never indexes.
 * Duplicated here (not imported) because that dispatch logic lives inline in a
 * server function; keep the two in sync if a new embed kind is added there.
 */
export const isCardUrl = (url: string): boolean => {
  const { hostname, pathname } = new URL(url);
  if ((hostname === "twitter.com" || hostname === "x.com") && /\/status\/\d+/.test(pathname)) {
    return false;
  }
  return !hostname.endsWith("youtube.com");
};

export const indexStory = async (hnStory: HNStory, url: string) => {
  // A KV read is cheaper and faster than a Vectorize query, and this runs for all 30
  // cards on every front-page render, so the marker is what keeps the summary and
  // embedding calls to one per story instead of one per render.
  const marker = `vec:${hnStory.id}`;
  if ((await env.CACHE.get(marker)) != null) {
    return;
  }

  const summary = await getSummary(hnStory.id, url);
  if (summary == null) {
    return;
  }

  const values = await embedOne(embedInput(hnStory.title, summary));
  if (values == null) {
    return;
  }

  await index().upsert([
    {
      id: String(hnStory.id),
      values,
      // Metadata is what the strip renders, so showing it needs no second HN fetch.
      // `at` is indexed for date filtering later; no query uses it yet.
      metadata: {
        title: hnStory.title,
        url,
        at: hnStory.time ?? Math.floor(Date.now() / 1000),
      },
    },
  ]);

  await env.CACHE.put(marker, "1");
};

/**
 * Fills the index from ordinary traffic — no crawler. Fire-and-forget via `waitUntil`
 * so summarising and embedding never delay a streaming card.
 *
 * Skipped in dev: `/api/generate` returns a fake summary there, and embedding that
 * would poison the shared production index (Vectorize has no local simulation).
 */
export const indexStoryInBackground = (hnStory: HNStory, url: string) => {
  if (import.meta.env.DEV) {
    return;
  }
  waitUntil(
    indexStory(hnStory, url).catch((err) => {
      console.error({ message: "Cannot index story", storyId: hnStory.id, err });
    }),
  );
};
