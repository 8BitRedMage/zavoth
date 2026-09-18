// Contract shared by the voice server operations and the browser client.

/** Pages the assistant can open. The client maps these to routes. */
export const VOICE_PAGES = [
  "dashboard",
  "portfolios",
  "analytics",
  "reports",
  "integrations",
  "settings",
] as const;
export type VoicePage = (typeof VOICE_PAGES)[number];

/**
 * Tools the browser runs itself because they act on the UI, not on data.
 * Every other tool call is sent to the `executeVoiceTool` action.
 */
export const CLIENT_TOOL_NAMES = ["navigate_to", "end_conversation"] as const;
export type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number];

// Wasp operation payloads must be plain JSON-like type aliases (interfaces
// lack the index signature its `Payload` constraint looks for).
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type RealtimeToolDefinition = {
  type: "function";
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: { [key: string]: Json };
};

/** The `session` object of a Higgs Realtime `session.update` event. */
export type RealtimeSessionConfig = {
  type: "realtime";
  model: string;
  instructions: string;
  output_modalities: ["audio"];
  audio: {
    input: {
      format: { type: "audio/pcm"; rate: number };
      noise_reduction: { type: "near_field" | "far_field" } | null;
      transcription: { model: string; language?: string } | null;
      turn_detection: { type: "server_vad" | "semantic_vad" };
    };
    output: {
      format: { type: "audio/pcm"; rate: number };
      voice: string;
    };
  };
  tools: RealtimeToolDefinition[];
  tool_choice: "auto";
};

export type VoiceSessionGrant = {
  url: string;
  /** Short-lived Boson key (`bai-eph-…`); only good for opening one socket. */
  clientSecret: string;
  session: RealtimeSessionConfig;
  greetingInstructions: string;
};

/**
 * A link for the user to click, shown in the widget. Built by the server
 * from known platforms, never from anything the model wrote, so a confused
 * or manipulated model cannot put an arbitrary URL in front of the user.
 */
export type VoiceLink = {
  url: string;
  label: string;
  /** Small print under the label, e.g. "Opens with your own login". */
  hint?: string;
  /** What the user is about to be asked, so they know what to look for. */
  checklist?: string[];
};

export type VoiceToolResult = {
  ok: boolean;
  /** JSON handed back to the model verbatim as the `function_call_output`. */
  output: string;
  link?: VoiceLink;
};
