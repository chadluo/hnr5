import * as React from "react";
import type { RelatedStory } from "@/lib/related";
import { getRelatedStories } from "@/server/related";

/**
 * Related stories, shown under the summary in the dialog. Fetched on open rather than
 * in a route loader, because the dialog lives on the list pages too. Renders nothing
 * when there is no match above the score threshold — which is the common case by
 * design, since a low bar produces confident-looking noise.
 */
export function Related({ storyId, isShowing }: { storyId: number; isShowing: boolean }) {
  const [related, setRelated] = React.useState<RelatedStory[]>([]);

  React.useEffect(() => {
    if (!isShowing) {
      return;
    }
    let cancelled = false;
    getRelatedStories({ data: storyId })
      .then((stories) => {
        if (!cancelled) {
          setRelated(stories);
        }
      })
      // `queryRelated` already swallows index errors; this is the transport failing.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storyId, isShowing]);

  if (related.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2 text-sm">
      <h3 className="font-bold text-neutral-500">Related</h3>
      <ul className="flex flex-col gap-2">
        {related.map(({ id, title, url }) => (
          <li key={id} className="flex flex-col gap-1">
            <a href={url} className="wrap-break-word hover:text-[#f60]" target="_blank" rel="noreferrer">
              {title}
            </a>
            <a href={`/story/${id}`} className="font-mono text-neutral-500 text-xs hover:text-[#f60]">
              discussion
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
