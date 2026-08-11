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
 * Page text for LLM input. Cloudflare-flavored sites serve `text/markdown` directly;
 * everything else falls back to KV-cached HTML stripped with regex.
 * Shared by `/api/generate` (streamed summary on click) and `getSummary`
 * (server-side summary for the related-story index) so both see identical input.
 */
export const getPageText = async (url: string) => {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/markdown" },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.ok && contentType.includes("text/markdown")) {
      return { text: await response.text(), source: "markdown" as const };
    }
  } catch {
    // fall through to HTML parsing
  }

  const html = await getHtmlContent(url);
  return html == null ? null : { text: stripHtml(html), source: "readability" as const };
};
