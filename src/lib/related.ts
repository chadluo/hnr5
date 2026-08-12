/**
 * Pure selection logic for related stories. Kept free of `cloudflare:workers`
 * imports so it stays unit-testable outside the Workers runtime.
 */

/**
 * Calibrated, not guessed. Measured over 553 stories / 14 days using
 * @cf/baai/bge-base-en-v1.5 embeddings of `title\nsummary`: unrelated pairs top out
 * around 0.73 (p99.9 of 152k pairs) while genuinely related pairs score 0.80-0.97.
 * Recalibrate (experiments/related.mjs) if the model or the embedded text changes —
 * this number is meaningless for a different model, input, or distance metric.
 */
export const MIN_SCORE = 0.8;

/** Low recall is intentional: ~10% of stories have any match above MIN_SCORE. */
export const MAX_RELATED = 3;

export type RelatedStory = {
  id: number;
  title: string;
  url: string;
  score: number;
};

/** The embedded text. The summary carries the topical signal; the title alone scores too low. */
export const embedInput = (title: string, summary: string) => `${title}\n${summary}`;

type Match = {
  id: string;
  score: number;
  metadata?: Record<string, unknown> | null;
};

/**
 * A story is always its own nearest neighbour (score 1.0), so it must be dropped
 * explicitly. Matches without title/url metadata cannot be rendered, so they go too.
 */
export const pickRelated = (matches: Match[], selfId: number): RelatedStory[] =>
  matches
    .filter(
      (m) =>
        m.id !== String(selfId) &&
        m.score >= MIN_SCORE &&
        typeof m.metadata?.title === "string" &&
        typeof m.metadata?.url === "string",
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED)
    .map((m) => ({
      id: Number(m.id),
      title: String(m.metadata?.title),
      url: String(m.metadata?.url),
      score: m.score,
    }));
