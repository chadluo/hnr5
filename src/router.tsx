import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  if (typeof window !== "undefined" && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [
        Sentry.tanstackRouterBrowserTracingIntegration(router),
        // Comment.tsx's console.error(err) calls pass the Error directly, so this
        // produces real captureException events (proper stack, proper grouping) —
        // unlike the server's object-first console.error({...}) calls, which don't
        // fit this integration's `instanceof Error` check. Server errors stay on
        // Cloudflare Workers Logs instead; see wrangler.jsonc's observability config.
        Sentry.captureConsoleIntegration({ levels: ["error"] }),
      ],
      tracesSampleRate: 0.1,
    });
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
