import { usePostHog } from "@posthog/react";
import type { Meta } from "@/lib/meta";

type Website =
  | "apple"
  | "github"
  | "google"
  | "medium"
  | "reddit"
  | "wikipedia"
  | "ycombinator"
  | "youtube";

export function Card({
  url,
  hnTitle,
  hnUrl,
  hnText,
  meta,
}: {
  url: string | undefined;
  hnTitle: string;
  hnUrl: string;
  hnText: string | undefined;
  meta: Meta | undefined;
}) {
  const posthog = usePostHog();
  const linkUrl = url ?? hnUrl;

  if (!url || meta == null) {
    return renderCard({
      url: linkUrl,
      title: hnTitle,
      source: extractSource(linkUrl),
      description: hnText ?? "",
      icon: undefined,
      onOpen: () =>
        posthog?.capture("story_article_opened", {
          story_source: "hacker_news",
          preview_type: "fallback",
        }),
    });
  }

  const title = meta.title ?? hnTitle;
  const description = meta.description ?? "";
  const imageUrl = checkImageUrl(meta.image);
  const imageAlt = meta.imageAlt;
  const dataSource = meta.authors ? meta.authors : extractSource(url);
  const website = findWebsite(url);
  const icon = website ? (
    <i className={`fa fa-${mapIcon(website)} mr-1`} />
  ) : undefined;

  return renderCard({
    url,
    title,
    source: dataSource,
    icon,
    description,
    imageUrl,
    imageAlt,
    onOpen: () =>
      posthog?.capture("story_article_opened", {
        story_source: website ?? "other",
        preview_type: "metadata",
      }),
  });
}

function renderCard({
  url,
  icon,
  source,
  title,
  description,
  imageUrl,
  imageAlt,
  onOpen,
}: {
  url: string;
  source: string;
  title: string;
  description: string;
  icon: React.JSX.Element | undefined;
  imageUrl?: string;
  imageAlt?: string;
  onOpen: () => void;
}) {
  return (
    <a
      href={url}
      title={url}
      className="flex flex-col gap-3 rounded bg-neutral-900/60 p-3 hover:bg-neutral-800/80 md:flex-row-reverse"
      target="_blank"
      rel="noreferrer"
      onClick={onOpen}
    >
      {imageUrl && (
        <div className="basis-1/3">
          <img
            src={imageUrl}
            alt={imageAlt ?? ""}
            className="aspect-2/1 w-full object-cover md:w-80"
          />
        </div>
      )}
      <div className="grow basis-2/3">
        <span className="line-clamp-2 text-neutral-400" title={url}>
          {icon}
          {source}
        </span>
        <h2
          className="font-bold"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
          dangerouslySetInnerHTML={{
            __html: title
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll("/", "<wbr>/"),
          }}
        />
        <div
          className="line-clamp-3 wrap-break-word text-neutral-400"
          style={{ overflowWrap: "anywhere" }}
          title={description}
        >
          {description}
        </div>
      </div>
    </a>
  );
}

function extractSource(url: string) {
  const { hostname, pathname } = new URL(url);
  if (hostname === "github.com" || hostname.includes("reddit.com")) {
    return takePath(pathname, 3);
  } else if (hostname === "medium.com") {
    return takePath(pathname, 2);
  } else if (hostname === "gist.github.com") {
    return `${hostname}/${takePath(pathname, 2)}`;
  } else {
    return hostname.replace(/^www\./, "");
  }
}

function takePath(pathname: string, parts: number) {
  return Array.from(pathname.split("/"))
    .slice(0, parts)
    .filter((s) => s !== "")
    .join("/");
}

function findWebsite(url: string): Website | undefined {
  const { hostname } = new URL(url);
  if (hostname.endsWith("apple.com")) {
    return "apple";
  } else if (hostname.endsWith("github.com")) {
    return "github";
  } else if (hostname.includes("google")) {
    return "google";
  } else if (hostname.endsWith("medium.com")) {
    return "medium";
  } else if (hostname.endsWith("reddit.com")) {
    return "reddit";
  } else if (hostname.endsWith("wikipedia.org")) {
    return "wikipedia";
  } else if (hostname.endsWith("ycombinator.com")) {
    return "ycombinator";
  } else if (hostname.endsWith("youtube.com")) {
    return "youtube";
  } else {
    return undefined;
  }
}

function mapIcon(website: Website) {
  switch (website) {
    case "reddit":
      return "reddit-alien";
    case "wikipedia":
      return "wikipedia-w";
    case "youtube":
      return "youtube-play";
    case "ycombinator":
      return "y-combinator";
    default:
      return website;
  }
}

function checkImageUrl(image?: string) {
  if (image && URL.canParse(image)) {
    return image;
  }
}
