import { env } from "cloudflare:workers";
import { getTweet, type Tweet } from "react-tweet/api";

const CACHE_TTL_SECONDS = 3600 * 24;

export async function getCachedTweet(id: string): Promise<Tweet | undefined> {
  const cacheKey = `tweet:${id}`;
  const cached = await env.CACHE.get(cacheKey, "json");
  if (cached != null) {
    return cached as Tweet;
  }

  // react-tweet throws on any non-2xx whose body is not JSON: fetch-tweet.js reads
  // `data.error` after setting `data = undefined`, so its own fallback message is
  // unreachable and you get a TypeError instead. x.com's syndication endpoint serves
  // HTML rate-limit and block pages often enough that this rejected the whole story
  // card. The card already renders <TweetNotFound /> for an absent tweet.
  let tweet: Tweet | undefined;
  try {
    tweet = await getTweet(id);
  } catch (err) {
    console.error({ tweetId: id, result: "getTweet failed", err });
    return undefined;
  }

  if (tweet != null) {
    await env.CACHE.put(cacheKey, JSON.stringify(tweet), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }
  return tweet;
}
