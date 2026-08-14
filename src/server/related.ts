import { createServerFn } from "@tanstack/react-start";
import type { RelatedStory } from "@/lib/related";
import { queryRelated } from "@/lib/vector";

/**
 * Called from `Related` when the dialog opens, so it is a server function rather than a
 * server route. Like `getStoryData`, this module must not import `cloudflare:workers`
 * directly — a client component imports it, so the client build has to resolve it.
 */
export const getRelatedStories = createServerFn({ method: "GET" })
  .validator((storyId: number) => storyId)
  .handler(({ data: storyId }): Promise<RelatedStory[]> => queryRelated(storyId));
