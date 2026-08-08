import { createFileRoute } from "@tanstack/react-router";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Story } from "@/components/Story";
import { getHNStories } from "@/lib/hn";
import { getStoryData } from "@/server/story";

export const Route = createFileRoute("/")({
  loader: async () => {
    const storyIds = await getHNStories("top");
    return {
      storyIds,
      stories: storyIds.map((id) => getStoryData({ data: id })),
    };
  },
  component: Home,
});

function Home() {
  const { storyIds, stories } = Route.useLoaderData();

  return (
    <>
      <Header activePage="top" />
      <main className="mx-auto flex min-w-64 max-w-4xl flex-col gap-8 px-4">
        {storyIds.map((storyId, i) => (
          <Story key={storyId} promise={stories[i]} />
        ))}
      </main>
      <Footer />
    </>
  );
}
