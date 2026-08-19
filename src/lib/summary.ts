import { env } from "cloudflare:workers";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { getPageText } from "./contents";
import { openRouterConfig, summarySystemPrompt } from "./model";

/**
 * Server-side summary, KV-cached forever under `summary:{id}`.
 *
 * `/api/generate` streams a summary to the browser when the user opens the dialog but
 * never persists it. The related-story index needs a summary for every story whether
 * or not anyone clicks, so it is generated here instead. Cached without a TTL: a
 * story's summary does not change, and the cache is what keeps this to one LLM call
 * per story rather than one per page render.
 */
export const getSummary = async (storyId: number, url: string) => {
  const cacheKey = `summary:${storyId}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached != null) {
    return cached;
  }

  const page = await getPageText(url);
  if (page == null) {
    return null;
  }

  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  const { text } = await generateText({
    model: openrouter(openRouterConfig.model),
    system: summarySystemPrompt,
    prompt: page.text,
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
    },
  });

  const summary = text.trim();
  if (!summary) {
    return null;
  }

  await env.CACHE.put(cacheKey, summary);
  return summary;
};
