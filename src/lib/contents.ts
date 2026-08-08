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
