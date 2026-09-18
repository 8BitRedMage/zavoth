import { action, type Spec } from "@wasp.sh/spec";

import {
  createVoiceSession,
  executeVoiceTool,
} from "./operations" with { type: "ref" };

export const voiceSpec: Spec = [
  action(createVoiceSession, { entities: ["Membership", "Organization"] }),
  // Dispatches to the competitive operations, so it needs the union of their
  // entities. Declaring them also makes Wasp refetch the affected queries
  // after a voice command changes data.
  action(executeVoiceTool, {
    entities: [
      "Membership",
      "Organization",
      "Portfolio",
      "PortfolioItem",
      "TrackedEntity",
      "Tracker",
      "Tag",
      "EntityTag",
      "Touchpoint",
      "File",
      "ManualImport",
    ],
  }),
];
