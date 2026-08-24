import { withSentry, vercelAIIntegration } from "@sentry/cloudflare/nodejs_compat";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, {
  createServerEntry,
  type ServerEntry,
} from "@tanstack/react-start/server-entry";
import { runIndexCron } from "@/lib/cron";

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request: Request) {
    return handler.fetch(request);
  },
});

const serverEntry = createServerEntry(requestHandler);

export default withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    environment: import.meta.env.DEV ? "development" : "production",
    // The AI SDK is v7, which needs the `/nodejs_compat` entrypoint. Cloudflare cannot
    // patch call sites, so every generateText/streamText must also pass
    // `experimental_telemetry: { isEnabled: true }` or it produces no spans.
    integrations: [vercelAIIntegration()],
    enableLogs: true,
    tracesSampleRate: 0.1,
  }),
  {
    fetch: (request) => serverEntry.fetch(request),
    scheduled: (controller, _env, ctx) => {
      ctx.waitUntil(runIndexCron(controller.cron));
    },
  },
);
