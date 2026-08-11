import { createServerFn } from "@tanstack/react-start";
import type { RelatedStory } from "@/lib/related";
import { queryRelated } from "@/lib/vector";

/**
 * Consumed only by the `story.$slug` loader, so it is a server function rather than a
 * server route. Like `getStoryData`, this module must not import `cloudflare:workers`
 * directly — the route imports it, so the client build has to be able to resolve it.
 */
export const getRelatedStories = createServerFn({ method: "GET" })
  .validator((storyId: number) => storyId)
  .handler(({ data: storyId }): Promise<RelatedStory[]> => queryRelated(storyId));
