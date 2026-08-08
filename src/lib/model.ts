import { z } from "zod";

export const openRouterConfig = {
  model: "openrouter/auto",
  schema: z.object({
    summary: z.string(),
    model: z.string(),
  }),
};
