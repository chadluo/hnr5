import { env } from "cloudflare:workers";
import { getTweet, type Tweet } from "react-tweet/api";

const CACHE_TTL_SECONDS = 3600 * 24;

export async function getCachedTweet(id: string): Promise<Tweet | undefined> {
  const cacheKey = `tweet:${id}`;
  const cached = await env.CACHE.get(cacheKey, "json");
  if (cached != null) {
    return cached as Tweet;
  }

  const tweet = await getTweet(id);
  if (tweet != null) {
    await env.CACHE.put(cacheKey, JSON.stringify(tweet), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }
  return tweet;
}
