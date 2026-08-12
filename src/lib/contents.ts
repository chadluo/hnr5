import { env } from "cloudflare:workers";
import { canVisit } from "./can_visit";

const DEFAULT_TIMEOUT_MS = 5000;
const CACHE_TTL_SECONDS = 3600;

export const getHtmlContent = async (url: string) => {
  if (!canVisit(url)) {
    return null;
  }

  const cacheKey = `html:${url}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached != null) {
    return cached;
  }

  const controller = new AbortController();
  const abortTimeout = setTimeout(
    () => controller.abort(),
    DEFAULT_TIMEOUT_MS,
  );

  const html = await fetch(url, { signal: controller.signal })
    .then((response) => response.text())
    .catch((err) => {
      console.error({ message: "Cannot fetch html", url, err });
      return null;
    })
    .finally(() => {
      clearTimeout(abortTimeout);
    });

  if (html != null) {
    await env.CACHE.put(cacheKey, html, {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }

  return html;
};

/** Strip HTML to plain-ish text for LLM input. No JSDOM/Readability in Workers. */
const stripHtml = (html: string) =>
  html
    .replace(
      /<(script|noscript|style|svg|nav|footer|header|aside|form|button|select|textarea|iframe|canvas|video|audio|picture)\b[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(img|input|link|source|br|hr|wbr)\b[^>]*\/?>/gi, "")
    .replace(/<([a-z][a-z0-9]*)\b([^>]*)>/gi, (_match: string, tag: string, attrs: string) => {
      const kept = attrs.match(/\b(property|name|content)="[^"]*"/gi);
      return kept ? `<${tag} ${kept.join(" ")}>` : `<${tag}>`;
    })
    .replace(/\s{2,}/g, " ");

/**
 * Truncation for LLM input. A stripped docs page or wiki article runs to hundreds of
 * KB; past a model's context OpenRouter rejects the request outright, and `indexStory`
 * then never writes its `vec:{id}` marker, so it retries that same failing call on
 * every render. 24000 is what `experiments/related.mjs` truncated to, so indexed
 * summaries stay comparable to the ones the 0.80 threshold was calibrated against.
 */
const MAX_PROMPT_CHARS = 24000;

/**
 * Page text for LLM input. Cloudflare-flavored sites serve `text/markdown` directly;
 * everything else falls back to KV-cached HTML stripped with regex.
 * Shared by `/api/generate` (streamed summary on click) and `getSummary`
 * (server-side summary for the related-story index) so both see identical input.
 */
export const getPageText = async (url: string) => {
  // Gate before the markdown fetch, not just inside `getHtmlContent`: `indexStory`
  // calls this for every card-kind story until its marker exists, so an unguarded
  // blocked or `.pdf` URL costs an outbound fetch plus a 5s timeout on every render.
  if (!canVisit(url)) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "text/markdown" },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.ok && contentType.includes("text/markdown")) {
      // An empty document is not a usable prompt: callers only check for null, so
      // returning `text: ""` would summarise nothing — and `getSummary` would cache
      // that result forever and embed it. Fall through to HTML instead.
      const text = (await response.text()).trim().slice(0, MAX_PROMPT_CHARS);
      if (text) {
        return { text, source: "markdown" as const };
      }
    } else {
      // Release the connection before the HTML fallback opens its own.
      await response.body?.cancel();
    }
  } catch {
    // fall through to HTML parsing
  }

  const html = await getHtmlContent(url);
  if (html == null) {
    return null;
  }

  const text = stripHtml(html).trim().slice(0, MAX_PROMPT_CHARS);
  return text ? { text, source: "html" as const } : null;
};
