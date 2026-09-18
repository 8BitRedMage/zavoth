import * as z from "zod";

// All optional: a footprint lookup simply reports a source as "not
// configured" when its credentials are missing.
export const competitiveEnvSchema = z.object({
  // Sent in the User-Agent of outbound lookups so site owners can reach us.
  // SEC EDGAR rejects requests that do not identify a contact.
  COLLECTOR_CONTACT_EMAIL: z.string().email().optional(),
  // A Reddit "script" or "web" app, used for app-only OAuth. Reddit refuses
  // unauthenticated API calls.
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
});
