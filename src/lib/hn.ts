const HN_ENDPOINT = "https://hacker-news.firebaseio.com/v0";

export type HNStory = {
  id: number;
  by: string;
  title: string;
  url?: string;
  text?: string;
  time?: number;
  kids?: number[];
  type: "job" | "story" | "comment" | "poll" | "pollopt";
};

export type HNComment = {
  text: string;
  by: string;
  kids: number[] | undefined;
  deleted: boolean | undefined;
  dead: boolean | undefined;
};

export async function getHNStories(storyRank = "top") {
  try {
    const response = await fetch(
      `${HN_ENDPOINT}/${storyRank}stories.json?limitToFirst=30&orderBy="$priority"`,
      { cache: "no-store" },
    );
    return (await response.json()) as number[];
  } catch (err) {
    console.error({ message: "Failed fetching stories", storyRank, err });
    return [];
  }
}

export async function getHnStory(storyId: number) {
  try {
    const response = await fetch(`${HN_ENDPOINT}/item/${storyId}.json`, {
      cache: "no-store",
    });
    return (await response.json()) as HNStory;
  } catch (err) {
    console.error({ message: "Failed getting story", storyId, err });
  }
}

export async function getHNComment(
  commentId: number,
  abortController: AbortController,
) {
  try {
    const response = await fetch(`${HN_ENDPOINT}/item/${commentId}.json`, {
      cache: "no-store",
      signal: abortController.signal,
    });
    return (await response.json()) as HNComment;
  } catch (err) {
    // Comment.tsx aborts this fetch on every unmount/collapse — routine, not a
    // failure. Logging it would flood both Workers Logs and (via
    // captureConsoleIntegration) Sentry with non-actionable cancellations.
    if (err instanceof DOMException && err.name === "AbortError") {
      return;
    }
    console.error({ message: "Failed getting comment", commentId, err });
  }
}
