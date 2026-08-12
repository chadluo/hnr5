import { Await } from "@tanstack/react-router";
import type { RelatedStory } from "@/lib/related";

/**
 * Related stories, streamed like the card itself. Renders nothing when there is no
 * match above the score threshold — which is the common case by design, since a low
 * bar produces confident-looking noise.
 */
export function Related({ promise }: { promise: Promise<RelatedStory[]> }) {
  return (
    <Await promise={promise} fallback={null}>
      {(related) => <RelatedList related={related} />}
    </Await>
  );
}

function RelatedList({ related }: { related: RelatedStory[] }) {
  if (related.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2 text-sm">
      <h3 className="font-bold text-neutral-500">Related</h3>
      <ul className="flex flex-col gap-2">
        {related.map(({ id, title, url }) => (
          <li key={id} className="flex flex-col gap-1 md:flex-row md:justify-between md:gap-4">
            <a href={url} className="wrap-break-word hover:text-[#f60]" target="_blank" rel="noreferrer">
              {title}
            </a>
            <a
              href={`/story/${id}`}
              className="shrink-0 font-mono text-neutral-500 text-xs hover:text-[#f60]"
            >
              discussion
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
