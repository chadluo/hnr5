import { createFileRoute } from "@tanstack/react-router";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Story } from "@/components/Story";
import { getHNStories } from "@/lib/hn";
import { getStoryData } from "@/server/story";

export const Route = createFileRoute("/best")({
  loader: async () => {
    const storyIds = await getHNStories("best");
    return {
      storyIds,
      stories: storyIds.map((id) => getStoryData({ data: id })),
    };
  },
  component: Best,
});

function Best() {
  const { storyIds, stories } = Route.useLoaderData();

  return (
    <>
      <Header activePage="best" />
      <main className="mx-auto flex min-w-64 max-w-4xl flex-col gap-8 px-4">
        {storyIds.map((storyId, i) => (
          <Story key={storyId} promise={stories[i]} />
        ))}
      </main>
      <Footer />
    </>
  );
}
