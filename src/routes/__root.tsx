import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";

const SITE_TITLE = "Hacker News Reader";
const SITE_DESCRIPTION =
  "Yet another Hacker News Reader with metadata cards and some LLM summaries.";
const SITE_IMAGE = "/hnr.png";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:image", content: SITE_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: SITE_IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "icon",
        href: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🗞️</text></svg>",
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const [deg1, h1, h2] = [
    Math.random() * 360,
    Math.random() * 360,
    Math.random() * 360,
  ];
  let deg2: number;
  do {
    deg2 = Math.random() * 360;
  } while (Math.abs(deg1 - deg2) < 90);

  const l = 0.3 + Math.random() * 0.1;
  const c = 0.2 + Math.random() * 0.1;

  const background = [
    `linear-gradient(${deg1}deg, oklch(${l} ${c} ${h1}deg), 20%, oklch(0 0 ${h1}deg / 0))`,
    `linear-gradient(${deg2}deg, oklch(${l} ${c} ${h2}deg), 20%, oklch(0 0 ${h2}deg / 0))`,
    "black",
  ].join(",");

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body
        style={{ background }}
        className="min-h-screen max-w-full overflow-x-hidden font-sans text-sm text-white md:text-base"
      >
        {children}
        <script src="https://kit.fontawesome.com/8c38f2aa0a.js" async />
        <Scripts />
      </body>
    </html>
  );
}
