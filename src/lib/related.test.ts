/**
 * No test framework is configured in this project, so this runs on Node's built-in
 * runner with no dependencies: `node --test src/lib/related.test.ts`
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_RELATED, MIN_SCORE, embedInput, pickRelated } from "./related.ts";

const match = (id: string, score: number, title = `t${id}`) => ({
  id,
  score,
  metadata: { title, url: `https://e.com/${id}` },
});

test("drops the story itself, which always self-matches at 1.0", () => {
  const picked = pickRelated([match("7", 1), match("8", 0.9)], 7);
  assert.deepEqual(
    picked.map((r) => r.id),
    [8],
  );
});

test("keeps only scores at or above the calibrated threshold", () => {
  // 0.73 is the measured ceiling of unrelated pairs — admitting it would ship noise,
  // which is the whole failure mode MIN_SCORE exists to prevent.
  const picked = pickRelated([match("1", 0.73), match("2", MIN_SCORE)], 9);
  assert.deepEqual(
    picked.map((r) => r.id),
    [2],
  );
});

test("returns highest scores first and caps the list", () => {
  const picked = pickRelated(
    [match("1", 0.81), match("2", 0.95), match("3", 0.88), match("4", 0.86)],
    9,
  );
  assert.equal(picked.length, MAX_RELATED);
  assert.deepEqual(
    picked.map((r) => r.id),
    [2, 3, 4],
  );
});

test("skips matches that cannot be rendered", () => {
  const noMeta = { id: "5", score: 0.99, metadata: null };
  const partial = { id: "6", score: 0.98, metadata: { title: "only a title" } };
  assert.deepEqual(pickRelated([noMeta, partial, match("7", 0.85)], 9).map((r) => r.id), [7]);
});

test("embeds title and summary together", () => {
  assert.equal(embedInput("Title", "A summary."), "Title\nA summary.");
});
