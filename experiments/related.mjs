// Offline test: does embedding cosine find genuinely related HN stories?
// Compares 3 embedding inputs — title only, truncated body, title+LLM summary.
// Nothing here runs in production; no Cloudflare bindings, no Vectorize.
//
// Run 1 (128 stories, one day) found all three variants FLAT: score did not
// correlate with correctness, so no useful threshold existed. This version tests
// whether a bigger multi-day corpus creates a usable high band, using known
// reposts (same URL, submitted twice) as ground-truth related pairs.
//
// Usage (Cloudflare creds come from your wrangler login; see resolveCf below):
//   OPENROUTER_API_KEY=... node experiments/related.mjs
//   node experiments/related.mjs --selftest    # cosine + labelling checks only
//
// Phases cache to experiments/.cache.json so re-runs are free. Delete it to refetch.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

const COUNT = Number(process.env.COUNT ?? 600); // target corpus size
const DAYS = Number(process.env.DAYS ?? 14); // how far back to draw from
const MIN_POINTS = Number(process.env.MIN_POINTS ?? 30);
const REPOST_PROBES = Number(process.env.REPOST_PROBES ?? 80);
const BODY_CHARS = 2000;
const THRESHOLDS = [0.7, 0.75, 0.8, 0.85, 0.9];
const SHOW_ABOVE = Number(process.env.SHOW_ABOVE ?? 0.8); // print every pair above this
const CACHE = new URL(".cache.json", import.meta.url);
const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

// ---------- cosine ----------

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

// Same URL, ignoring protocol/www/trailing slash and tracking params. Meaningful
// query params MUST survive: dropping them collapsed every youtube.com/watch?v=...
// into one key and poisoned the repost labels in run 2.
const TRACKING = /^(utm_|fbclid$|gclid$|ref$|ref_src$|source$|_hsenc$|mc_cid$|mc_eid$)/;

const normUrl = (url) => {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING.test(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}${params ? `?${params}` : ""}`;
  } catch {
    return url;
  }
};

const selftest = async () => {
  const { strict: assert } = await import("node:assert");
  assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-12, "identity");
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-12, "orthogonal");
  assert.ok(Math.abs(cosine([1, 0], [-1, 0]) + 1) < 1e-12, "opposite");
  // magnitude must not matter, only direction
  assert.ok(Math.abs(cosine([1, 1], [5, 5]) - 1) < 1e-12, "scale invariant");
  assert.ok(cosine([1, 1], [1, 0]) > cosine([1, 1], [1, -0.9]), "ordering");

  // Repost labelling is the ground truth for the whole run — it must not be sloppy.
  const same = "https://www.example.com/a/b/?utm_source=x";
  assert.equal(normUrl(same), normUrl("http://example.com/a/b"), "url normalize");
  assert.notEqual(normUrl("https://a.com/x"), normUrl("https://a.com/y"), "url distinct");
  // The bug that invalidated run 2: distinct videos must not share a key.
  const yt = "https://www.youtube.com/watch?v=";
  assert.notEqual(normUrl(`${yt}AAA`), normUrl(`${yt}BBB`), "youtube ids distinct");
  assert.equal(normUrl(`${yt}AAA&utm_source=hn`), normUrl(`${yt}AAA`), "youtube id kept");
  assert.equal(normUrl("https://a.com/x?b=2&a=1"), normUrl("https://a.com/x?a=1&b=2"), "param order");
  console.log("cosine + labelling ok");
};

// ---------- corpus ----------

const NO_VISIT = [
  "bloomberg.com",
  "economist.com",
  "ft.com",
  "nytimes.com",
  "reddit.com",
  "reuters.com",
  "telegraph.co.uk",
  "washingtonpost.com",
  "wsj.com",
];

const canVisit = (url) => {
  if (!url || !URL.canParse(url)) return false;
  if (url.endsWith(".pdf") || url.endsWith(".mp4")) return false;
  return !NO_VISIT.some((h) => new URL(url).hostname.includes(h));
};

const ALGOLIA = "https://hn.algolia.com/api/v1";

const toStory = (h) => ({
  id: Number(h.objectID),
  title: h.title,
  url: h.url,
  points: h.points ?? 0,
  at: h.created_at_i,
});

// topstories/beststories are current snapshots and cannot span days, so the corpus
// comes from Algolia's date index instead. Significance = points bucket.
const fetchCorpus = async () => {
  const since = Math.floor(Date.now() / 1000) - DAYS * 86400;
  const stories = new Map();

  for (let page = 0; page * 100 < COUNT * 1.6; page++) {
    const res = await fetch(
      `${ALGOLIA}/search_by_date?tags=story&hitsPerPage=100&page=${page}` +
        `&numericFilters=points>${MIN_POINTS},created_at_i>${since}`,
    );
    const { hits, nbPages } = await res.json();
    for (const h of hits) {
      if (h.title && canVisit(h.url)) stories.set(Number(h.objectID), toStory(h));
    }
    process.stderr.write(`  page ${page + 1} → ${stories.size} stories\r`);
    if (page + 1 >= (nbPages ?? 1)) break;
  }
  process.stderr.write("\n");

  // Positive control: hunt older submissions of the same URL. Same article posted
  // twice is ground-truth "related", with no human judgement involved.
  const probes = [...stories.values()].slice(0, REPOST_PROBES);
  let found = 0;
  for (let i = 0; i < probes.length; i += 5) {
    await Promise.all(
      probes.slice(i, i + 5).map(async (s) => {
        try {
          // Query the normalized host/path, NOT the raw URL — the "https://" prefix
          // breaks Algolia's tokenizer and silently returns zero matches.
          const res = await fetch(
            `${ALGOLIA}/search?tags=story&hitsPerPage=20&restrictSearchableAttributes=url` +
              `&query=${encodeURIComponent(normUrl(s.url))}`,
          );
          const { hits } = await res.json();
          for (const h of hits) {
            const id = Number(h.objectID);
            if (id !== s.id && !stories.has(id) && h.url && normUrl(h.url) === normUrl(s.url)) {
              stories.set(id, toStory(h));
              found++;
            }
          }
        } catch {
          /* probe is best-effort */
        }
      }),
    );
    process.stderr.write(`  repost probes ${Math.min(i + 5, probes.length)}/${probes.length}\r`);
  }
  process.stderr.write(`\n  found ${found} repost submissions\n`);

  return [...stories.values()].slice(0, COUNT + found);
};

// Same stripping as src/lib/contents.ts (copied on purpose — throwaway).
const toText = (html) =>
  html
    .replace(
      /<(script|noscript|style|svg|nav|footer|header|aside|form|button|select|textarea|iframe|canvas|video|audio|picture)\b[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const fetchBody = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const text = toText(await res.text());
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
};

// ---------- summary (same prompt as production) ----------

const SYSTEM = `You are an insightful assistant. Given the content of a webpage, based on your
knowledge, you can find the most important or most interesting information and
provide a summary of the information in one sentence. The summary should be in plain
text with no formatting.`;

const summarize = async (text) => {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/auto",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text.slice(0, 24000) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? null;
};

// ---------- embeddings (the model production would use) ----------

// Reuses the wrangler OAuth token (it already has `ai (write)` scope), so there is
// no separate API token to create. Env vars override if you'd rather use a real one.
const cf = { id: process.env.CF_ACCOUNT_ID, token: process.env.CF_AI_TOKEN };

const resolveCf = async () => {
  if (!cf.token) {
    const toml = `${homedir()}/Library/Preferences/.wrangler/config/default.toml`;
    // wrangler refreshes this on use, so re-reading each run picks up a live token.
    cf.token = readFileSync(toml, "utf8").match(/^oauth_token\s*=\s*"(.+)"/m)?.[1];
    if (!cf.token) throw new Error(`no oauth_token in ${toml} — run: wrangler login`);
  }
  if (!cf.id) {
    const res = await fetch("https://api.cloudflare.com/client/v4/accounts", {
      headers: { Authorization: `Bearer ${cf.token}` },
    });
    const json = await res.json();
    cf.id = json.result?.[0]?.id;
    if (!cf.id) throw new Error(`cannot resolve account id: ${JSON.stringify(json.errors)}`);
  }
};

const embed = async (texts) => {
  const out = [];
  for (let i = 0; i < texts.length; i += 20) {
    const batch = texts.slice(i, i + 20);
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cf.id}/ai/run/${EMBED_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cf.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: batch }),
      },
    );
    if (!res.ok) throw new Error(`workers-ai ${res.status} ${await res.text()}`);
    const json = await res.json();
    out.push(...json.result.data);
    process.stderr.write(`  embedded ${out.length}/${texts.length}\r`);
  }
  process.stderr.write("\n");
  return out;
};

// ---------- report ----------

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

const bucket = (points) => (points >= 300 ? "hi " : points >= 100 ? "mid" : "lo ");

// Every pair once, with its repost label.
const allPairs = (stories, vectors) => {
  const pairs = [];
  for (let i = 0; i < stories.length; i++) {
    for (let j = i + 1; j < stories.length; j++) {
      pairs.push({
        i,
        j,
        score: cosine(vectors[i], vectors[j]),
        repost: normUrl(stories[i].url) === normUrl(stories[j].url),
      });
    }
  }
  return pairs;
};

const report = (stories, variants) => {
  const n = stories.length;
  console.log(`\n${"=".repeat(78)}\nCORPUS: ${n} stories, ${(n * (n - 1)) / 2} pairs\n`);

  for (const [name, vectors] of Object.entries(variants)) {
    const pairs = allPairs(stories, vectors);
    const reposts = pairs.filter((p) => p.repost);
    const others = pairs.filter((p) => !p.repost);

    console.log(`${"-".repeat(78)}\n${name}\n`);

    // Where the collision band tops out. With few repost labels this matters more
    // than the labels: any usable threshold has to sit above these percentiles.
    const sorted = others.map((p) => p.score).sort((a, b) => a - b);
    const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    console.log(
      `  non-repost pairs (${sorted.length}): p50 ${pct(0.5).toFixed(3)}  ` +
        `p99 ${pct(0.99).toFixed(3)}  p99.9 ${pct(0.999).toFixed(3)}  ` +
        `p99.99 ${pct(0.9999).toFixed(3)}  max ${sorted.at(-1).toFixed(3)}`,
    );

    // THE decisive number: do known-true pairs outscore everything else?
    if (reposts.length) {
      const rs = reposts.map((p) => p.score);
      const worstTrue = Math.min(...rs);
      const falseAbove = others.filter((p) => p.score >= worstTrue).length;
      console.log(
        `  known reposts (${reposts.length}): min ${worstTrue.toFixed(3)}  ` +
          `med ${median(rs).toFixed(3)}  max ${Math.max(...rs).toFixed(3)}`,
      );
      for (const p of reposts.sort((a, b) => b.score - a.score)) {
        console.log(
          `    ${p.score.toFixed(3)}  ${stories[p.i].title.slice(0, 32)} :: ${stories[p.j].title.slice(0, 32)}`,
        );
      }
      console.log(
        `  non-repost pairs scoring >= the worst true pair: ${falseAbove}` +
          (falseAbove === 0 ? "  <- clean separation" : "  <- overlap, threshold is lossy"),
      );
    } else {
      console.log("  no repost pairs in corpus — positive control unavailable");
    }

    console.log("\n  T      pairs>=T   reposts>=T   precision-if-only-reposts-count");
    for (const t of THRESHOLDS) {
      const above = pairs.filter((p) => p.score >= t);
      const trueAbove = above.filter((p) => p.repost).length;
      const prec = above.length ? ((trueAbove / above.length) * 100).toFixed(1) : "—";
      console.log(
        `  ${t.toFixed(2)}   ${String(above.length).padStart(8)}   ` +
          `${String(trueAbove).padStart(10)}   ${prec}%`,
      );
    }

    // Print the actual high-scoring pairs — the precision number above only counts
    // reposts as correct, so topical matches must still be judged by eye.
    const show = pairs.filter((p) => p.score >= SHOW_ABOVE).sort((a, b) => b.score - a.score);
    console.log(`\n  pairs >= ${SHOW_ABOVE} (${show.length}), judge these yourself:`);
    for (const p of show.slice(0, 40)) {
      const tag = p.repost ? "REPOST" : "      ";
      console.log(`  ${p.score.toFixed(3)} ${tag} [${bucket(stories[p.i].points)}] ${stories[p.i].title.slice(0, 52)}`);
      console.log(`               ${" ".repeat(6)} [${bucket(stories[p.j].points)}] ${stories[p.j].title.slice(0, 52)}`);
    }
    if (show.length > 40) console.log(`  ... ${show.length - 40} more`);
    console.log();
  }

  console.log(
    `${"=".repeat(78)}\nHow to read this: the repost line is the test. If known-true pairs sit\n` +
      `above every collision, a threshold exists — use it. If collisions reach the\n` +
      `same scores, no threshold can separate them and the feature cannot work this way.\n`,
  );
};

// ---------- main ----------

const main = async () => {
  if (process.argv.includes("--selftest")) return selftest();
  await selftest();

  if (!process.env.OPENROUTER_API_KEY) throw new Error("missing env OPENROUTER_API_KEY");
  await resolveCf();
  console.log(`cloudflare account ${cf.id}`);

  let stories;
  // `at` only exists in run-2 corpora; an older cache would silently defeat the
  // whole point of enlarging the corpus, so ignore it rather than trust it.
  const cached = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : null;
  if (cached?.[0]?.at !== undefined) {
    stories = cached;
    console.log(`cache: ${stories.length} stories`);
  } else {
    if (cached) console.log("ignoring stale run-1 cache (no date field), refetching");
    console.log(`fetching up to ${COUNT} stories over ${DAYS}d (>${MIN_POINTS} points)...`);
    stories = await fetchCorpus();
    console.log(`${stories.length} candidates, getting bodies...`);

    // 8 at a time — polite, and fast enough for a few hundred.
    for (let i = 0; i < stories.length; i += 8) {
      const chunk = stories.slice(i, i + 8);
      await Promise.all(chunk.map(async (s) => (s.body = await fetchBody(s.url))));
      process.stderr.write(`  bodies ${Math.min(i + 8, stories.length)}/${stories.length}\r`);
    }
    process.stderr.write("\n");

    stories = stories.filter((s) => s.body);
    console.log(`${stories.length} with usable bodies, summarizing...`);

    for (let i = 0; i < stories.length; i += 4) {
      const chunk = stories.slice(i, i + 4);
      await Promise.all(
        chunk.map(async (s) => {
          try {
            s.summary = await summarize(s.body);
          } catch (err) {
            console.error(`  summary failed ${s.id}: ${err.message}`);
          }
        }),
      );
      process.stderr.write(`  summaries ${Math.min(i + 4, stories.length)}/${stories.length}\r`);
    }
    process.stderr.write("\n");

    stories = stories.filter((s) => s.summary);
    writeFileSync(CACHE, JSON.stringify(stories));
    console.log(`cached ${stories.length} stories with summaries`);
  }

  const reposts = new Set();
  for (const s of stories) {
    const k = normUrl(s.url);
    if (reposts.has(k)) console.log(`  repost pair present: ${s.title.slice(0, 60)}`);
    reposts.add(k);
  }

  console.log("embedding: title");
  const title = await embed(stories.map((s) => s.title));
  console.log("embedding: body (truncated)");
  const body = await embed(stories.map((s) => s.body.slice(0, BODY_CHARS)));
  console.log("embedding: title+summary");
  const summary = await embed(stories.map((s) => `${s.title}\n${s.summary}`));

  report(stories, { "title-only": title, "body-2k": body, "title+summary": summary });
};

await main();
