import { PostHogProvider } from "@posthog/react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";

const SITE_TITLE = "Hacker News Reader";
const SITE_DESCRIPTION =
  "Yet another Hacker News Reader with metadata cards and some LLM summaries.";
const SITE_IMAGE = "/hnr.png";

const posthogProjectToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

if (import.meta.env.DEV && !posthogProjectToken) {
  throw new Error(
    "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
  );
}

if (import.meta.env.DEV && !posthogHost) {
  throw new Error(
    "VITE_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_HOST is configured",
  );
}

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
        {posthogProjectToken && posthogHost ? (
          <PostHogProvider
            apiKey={posthogProjectToken}
            options={{
              api_host: posthogHost,
              ui_host: posthogHost,
              defaults: "2025-05-24",
              capture_exceptions: true,
              debug: import.meta.env.DEV,
            }}
          >
            {children}
          </PostHogProvider>
        ) : (
          children
        )}
        <script src="https://kit.fontawesome.com/8c38f2aa0a.js" async />
        <Scripts />
      </body>
    </html>
  );
}
