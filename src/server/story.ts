import { createServerFn } from "@tanstack/react-start";
import { getHtmlContent } from "@/lib/contents";
import { getHnStory, type HNStory } from "@/lib/hn";
import { getMeta, type Meta } from "@/lib/meta";
import { getCachedTweet } from "@/lib/tweet";
import { indexStoryInBackground } from "@/lib/vector";
import type { Tweet } from "react-tweet/api";

export type StoryData =
  | { kind: "missing" }
  | { kind: "tweet"; hnStory: HNStory; tweetId: string; tweet: Tweet | undefined }
  | { kind: "youtube"; hnStory: HNStory; youtubeId: string }
  | { kind: "card"; hnStory: HNStory; meta: Meta | undefined };

export const getStoryData = createServerFn({ method: "GET" })
  .validator((storyId: number) => storyId)
  .handler(async ({ data: storyId }): Promise<StoryData> => {
    const hnStory = await getHnStory(storyId);
    if (!hnStory) {
      return { kind: "missing" };
    }

    const { url } = hnStory;
    if (url) {
      const { hostname, pathname, searchParams } = new URL(url);

      if (
        (hostname === "twitter.com" || hostname === "x.com") &&
        pathname.match(/\/status\/\d+/)
      ) {
        const tweetId = pathname.split("/").slice(-1)[0];
        const tweet = await getCachedTweet(tweetId);
        return { kind: "tweet", hnStory, tweetId, tweet };
      }

      if (hostname.endsWith("youtube.com")) {
        const youtubeId = searchParams.get("v");
        if (youtubeId) {
          return { kind: "youtube", hnStory, youtubeId };
        }
      }
    }

    if (!url) {
      return { kind: "card", hnStory, meta: undefined };
    }

    const html = await getHtmlContent(url);
    const meta = html != null ? await getMeta(storyId, html) : undefined;
    // Fills the related-story index from ordinary traffic. Runs for every card on
    // every render, but is a no-op once the story has a vector.
    indexStoryInBackground(hnStory, url);
    return { kind: "card", hnStory, meta };
  });
