/**
 * No test framework is configured in this project, so this runs on Node's built-in
 * runner with no dependencies: `node --test src/lib/can_visit.test.ts`
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { canVisit } from "./can_visit.ts";

test("blocks media by path, not by raw-URL suffix", () => {
  // The gate exists to stop outbound fetches that can never yield page text.
  // Matching the raw URL let a query string or fragment smuggle one through.
  assert.equal(canVisit("https://e.com/paper.pdf"), false);
  assert.equal(canVisit("https://e.com/paper.pdf?download=1"), false);
  assert.equal(canVisit("https://e.com/paper.pdf#page=2"), false);
  assert.equal(canVisit("https://e.com/paper.PDF"), false);
  assert.equal(canVisit("https://e.com/clip.mp4?t=10"), false);
});

test("does not block pages that merely mention a media extension", () => {
  assert.equal(canVisit("https://e.com/how-to-read-a.pdf-file"), true);
  assert.equal(canVisit("https://e.com/article?ref=paper.pdf"), true);
});

test("blocks paywalled hosts including subdomains", () => {
  assert.equal(canVisit("https://www.wsj.com/articles/x"), false);
  assert.equal(canVisit("https://old.reddit.com/r/x"), false);
});

test("rejects unparseable urls rather than throwing", () => {
  assert.equal(canVisit("not a url"), false);
  assert.equal(canVisit(""), false);
});
