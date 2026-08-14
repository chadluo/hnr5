import { createFileRoute } from "@tanstack/react-router";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Story } from "@/components/Story";
import { getStoryData } from "@/server/story";

export const Route = createFileRoute("/story/$slug")({
  loader: async ({ params }) => {
    const storyId = Number(params.slug);
    return {
      storyId,
      story: getStoryData({ data: storyId }),
    };
  },
  component: StoryPage,
});

function StoryPage() {
  const { storyId, story } = Route.useLoaderData();

  return (
    <>
      <Header />
      <main className="mx-auto flex min-w-64 max-w-4xl flex-col gap-8 px-4">
        <Story key={storyId} promise={story} />
      </main>
      <Footer />
    </>
  );
}
