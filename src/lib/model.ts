import { z } from "zod";

/**
 * Shared by the streamed summary (`/api/generate`) and the server-side summary that
 * feeds the related-story index, so both produce comparable text — the 0.80 score
 * threshold in `related.ts` was calibrated against summaries from this prompt.
 */
export const summarySystemPrompt = `You are an insightful assistant. Given the content of a webpage, based on your
              knowledge, you can find the most important or most interesting information and
              provide a summary of the information in one sentence. The summary should be in plain
              text with no formatting.`;

export const openRouterConfig = {
  model: "openrouter/auto",
  schema: z.object({
    summary: z.string(),
    model: z.string(),
  }),
};
