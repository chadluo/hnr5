import { env } from "cloudflare:workers";
import { getTweet, type Tweet } from "react-tweet/api";

const CACHE_TTL_SECONDS = 3600 * 24;

// Any non-empty value works; x.com only rejects a missing User-Agent.
const TWEET_FETCH_UA = "hnr5 (+https://github.com/chadluo/hnr5)";

export async function getCachedTweet(id: string): Promise<Tweet | undefined> {
  const cacheKey = `tweet:${id}`;
  const cached = await env.CACHE.get(cacheKey, "json");
  if (cached != null) {
    return cached as Tweet;
  }

  // Workers send no User-Agent on subrequests, and x.com's syndication endpoint
  // answers a UA-less request with 400 + an empty body. That is why every tweet card
  // rendered as <TweetNotFound /> in production while working locally. Any non-empty
  // UA string is accepted.
  //
  // The try/catch stays because react-tweet throws on any non-2xx whose body is not
  // JSON: fetch-tweet.js reads `data.error` after setting `data = undefined`, so its
  // own fallback message is unreachable and you get a TypeError instead. The card
  // already renders <TweetNotFound /> for an absent tweet.
  let tweet: Tweet | undefined;
  try {
    tweet = await getTweet(id, { headers: { "User-Agent": TWEET_FETCH_UA } });
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
