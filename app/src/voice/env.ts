import * as z from "zod";

export const voiceEnvSchema = z.object({
  BOSON_KEY: z.string({
    error: "BOSON_KEY is required for voice chat",
  }),
});
