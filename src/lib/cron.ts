import { getHNStories, getHnStory } from "./hn";
import { indexStory, isCardUrl } from "./vector";

/**
 * Cron trigger strings — must match `wrangler.jsonc`'s `triggers.crons` exactly, since
 * that's the only way `scheduled()` knows which feed fired. Both are offset a few
 * minutes past the clock to avoid hitting HN/OpenRouter/Workers AI at the top of the
 * hour alongside every other cron job on the internet.
 */
export const TOP_CRON = "7 */4 * * *"; // top stories, every 4h
export const BEST_CRON = "13 3 * * *"; // best stories, once daily (off-peak UTC)

const FEED_BY_CRON: Record<string, "top" | "best"> = {
  [TOP_CRON]: "top",
  [BEST_CRON]: "best",
};

/**
 * Fills the related-story index independently of site traffic. `indexStoryInBackground`
 * (`src/lib/vector.ts`) only runs when a visitor renders a card, so a story that's never
 * viewed while it's live on HN's list is skipped forever once it rotates off. This reuses
 * `indexStory`'s KV marker, so re-indexing an already-seen story here is just a cache hit.
 */
export const runIndexCron = async (cron: string) => {
  const feed = FEED_BY_CRON[cron];
  if (!feed) {
    console.error({ message: "Unknown cron trigger", cron });
    return;
  }

  const ids = await getHNStories(feed);
  for (const id of ids) {
    const hnStory = await getHnStory(id);
    if (!hnStory?.url || !isCardUrl(hnStory.url)) {
      continue;
    }
    try {
      await indexStory(hnStory, hnStory.url);
    } catch (err) {
      console.error({ message: "Cron: cannot index story", storyId: id, err });
    }
  }
};
