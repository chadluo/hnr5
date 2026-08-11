import { createFileRoute } from "@tanstack/react-router";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Related } from "@/components/Related";
import { Story } from "@/components/Story";
import { getRelatedStories } from "@/server/related";
import { getStoryData } from "@/server/story";

export const Route = createFileRoute("/story/$slug")({
  loader: async ({ params }) => {
    const storyId = Number(params.slug);
    return {
      storyId,
      story: getStoryData({ data: storyId }),
      // Deferred like the story itself, so a slow index read never blocks the card.
      related: getRelatedStories({ data: storyId }),
    };
  },
  component: StoryPage,
});

function StoryPage() {
  const { storyId, story, related } = Route.useLoaderData();

  return (
    <>
      <Header />
      <main className="mx-auto flex min-w-64 max-w-4xl flex-col gap-8 px-4">
        <Story key={storyId} promise={story} />
        <Related key={`related-${storyId}`} promise={related} />
      </main>
      <Footer />
    </>
  );
}
