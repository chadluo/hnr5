import { usePostHog } from "@posthog/react";
import { Await } from "@tanstack/react-router";
import { EmbeddedTweet, TweetNotFound } from "react-tweet";
import { Card } from "./Card";
import { Dialog } from "./Dialog";
import type { StoryData } from "@/server/story";

export function Story({ promise }: { promise: Promise<StoryData> }) {
  return (
    <Await promise={promise} fallback={<StoryPlaceholder />}>
      {(data) => <StoryContent data={data} />}
    </Await>
  );
}

function StoryContent({ data }: { data: StoryData }) {
  const posthog = usePostHog();

  if (data.kind === "missing") {
    return null;
  }

  const { hnStory } = data;
  const { id, title, url, text } = hnStory;
  const hnUrl = `https://news.ycombinator.com/item?id=${id}`;

  const storyLink = (
    <h2 className="flex flex-col justify-between gap-2 text-sm md:flex-row md:text-base">
      <a
        href={hnUrl}
        className="font-bold hover:text-[#f60]"
        target="_blank"
        rel="noreferrer"
        onClick={() =>
          posthog?.capture("story_discussion_link_opened", {
            story_id: id,
            story_type: data.kind,
          })
        }
      >
        {title}
      </a>
      <Dialog hnStory={hnStory} />
    </h2>
  );

  return (
    <div className="flex flex-col gap-3">
      {storyLink}
      {data.kind === "tweet" ? (
        data.tweet ? (
          <EmbeddedTweet tweet={data.tweet} />
        ) : (
          <TweetNotFound />
        )
      ) : data.kind === "youtube" ? (
        <YoutubePlayer title={title} youtubeId={data.youtubeId} />
      ) : (
        <Card
          url={url}
          hnTitle={title}
          hnUrl={hnUrl}
          hnText={text}
          meta={data.meta}
        />
      )}
    </div>
  );
}

export const StoryPlaceholder = () => {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-6 bg-neutral-900/60" />
      <div className="h-36 bg-neutral-900/60" />
    </div>
  );
};

const YoutubePlayer = ({
  title,
  youtubeId,
}: {
  title: string;
  youtubeId: string;
}) => (
  <div className="aspect-video max-w-2xl">
    <iframe
      title={title}
      width="100%"
      height="100%"
      src={`https://www.youtube.com/embed/${youtubeId}`}
    />
  </div>
);
