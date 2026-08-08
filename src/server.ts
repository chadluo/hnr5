import { withSentry } from "@sentry/cloudflare";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, {
  createServerEntry,
  type ServerEntry,
} from "@tanstack/react-start/server-entry";

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request: Request) {
    return handler.fetch(request);
  },
});

const serverEntry = createServerEntry(requestHandler);

export default withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  {
    fetch: (request) => serverEntry.fetch(request),
  },
);
