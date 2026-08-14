import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, streamText } from "ai";
import { getPageText } from "@/lib/contents";
import type { HNStory } from "@/lib/hn";
import { openRouterConfig, summarySystemPrompt } from "@/lib/model";

const DEFAULT_SUMMARY = "summary";

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const trace: Record<string, unknown> = {};

        const { id, url }: HNStory = await request.json();
        trace["id"] = id;
        if (!url) {
          console.error({ ...trace, result: "no url" });
          return new Response(null, { status: 400 });
        }
        trace["url"] = url;

        if (import.meta.env.DEV) {
          console.info({ ...trace, result: "fake summary" });
          return new Response(JSON.stringify({ summary: DEFAULT_SUMMARY }));
        }

        const page = await getPageText(url);
        if (page == null) {
          console.error({ ...trace, result: "no html" });
          return new Response(null, { status: 502 });
        }

        const content = page.text;
        trace["source"] = page.source;
        trace["content"] = content;

        const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
        const model = openrouter(openRouterConfig.model);

        try {
          const result = streamText({
            model,
            output: Output.object({ schema: openRouterConfig.schema }),
            system: summarySystemPrompt,
            prompt: content,
          });

          console.info({ ...trace, result: "streaming" });
          return result.toTextStreamResponse();
        } catch (err) {
          // `streamText` validates the prompt synchronously, so a bad call throws here
          // rather than in the stream. Uncaught, the platform logs only a stack — the
          // message is the part that names what was wrong.
          console.error({
            ...trace,
            result: "streamText failed",
            err: err instanceof Error ? `${err.message}\n${err.stack}` : err,
          });
          return new Response(null, { status: 500 });
        }
      },
    },
  },
});
