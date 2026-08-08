import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, streamText } from "ai";
import { getHtmlContent } from "@/lib/contents";
import type { HNStory } from "@/lib/hn";
import { openRouterConfig } from "@/lib/model";

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

        let content: string | null = null;

        // Try Cloudflare markdown endpoint first
        try {
          const mdResponse = await fetch(url, {
            headers: { Accept: "text/markdown" },
            signal: AbortSignal.timeout(5000),
          });
          const contentType = mdResponse.headers.get("content-type") ?? "";
          if (mdResponse.ok && contentType.includes("text/markdown")) {
            content = await mdResponse.text();
            trace["source"] = "markdown";
          }
        } catch {
          // fall through to HTML parsing
        }

        // Fallback: fetch HTML and extract with regex
        if (!content) {
          const html = await getHtmlContent(url);

          if (!html) {
            console.error({ ...trace, result: "no html" });
            return new Response(null, { status: 502 });
          }

          content = html
            .replace(
              /<(script|noscript|style|svg|nav|footer|header|aside|form|button|select|textarea|iframe|canvas|video|audio|picture)\b[^>]*>[\s\S]*?<\/\1>/gi,
              "",
            )
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<(img|input|link|source|br|hr|wbr)\b[^>]*\/?>/gi, "")
            .replace(
              /<([a-z][a-z0-9]*)\b([^>]*)>/gi,
              (_match: string, tag: string, attrs: string) => {
                const kept = attrs.match(/\b(property|name|content)="[^"]*"/gi);
                return kept ? `<${tag} ${kept.join(" ")}>` : `<${tag}>`;
              },
            )
            .replace(/\s{2,}/g, " ");
          trace["source"] = "readability";
        }

        trace["content"] = content;

        const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
        const model = openrouter(openRouterConfig.model);

        const result = streamText({
          model,
          output: Output.object({ schema: openRouterConfig.schema }),
          messages: [
            {
              role: "system",
              content: `You are an insightful assistant. Given the content of a webpage, based on your
              knowledge, you can find the most important or most interesting information and
              provide a summary of the information in one sentence. The summary should be in plain
              text with no formatting.`,
            },
            {
              role: "user",
              content,
            },
          ],
        });

        console.info({ ...trace, result: "streaming" });
        return result.toTextStreamResponse();
      },
    },
  },
});
