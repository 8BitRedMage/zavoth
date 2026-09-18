import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { createVoiceSession, executeVoiceTool } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import { VOICE_PAGES, type VoicePage } from "../shared";
import {
  RealtimeSession,
  type RealtimeSessionHandlers,
  type TranscriptEntry,
  type VoiceStatus,
} from "./realtimeSession";

const PAGE_ROUTES: Record<VoicePage, string> = {
  dashboard: routes.DashboardRoute.to,
  portfolios: routes.PortfoliosRoute.to,
  analytics: routes.AnalyticsRoute.to,
  reports: routes.ReportsRoute.to,
  integrations: routes.IntegrationsRoute.to,
  settings: routes.AccountRoute.to,
};

function describeStartFailure(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Microphone access is blocked. Allow it for this site in your browser settings, then try again.";
    }
    if (error.name === "NotFoundError") {
      return "No microphone was found.";
    }
    if (error.name === "NotReadableError") {
      return "The microphone is in use by another app.";
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Voice chat could not start.";
}

export function useVoiceChat() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);

  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const runTool = useCallback<RealtimeSessionHandlers["runTool"]>(
    async (name, args) => {
      if (name === "navigate_to") {
        const page = (JSON.parse(args || "{}") as { page?: VoicePage }).page;
        if (!page || !VOICE_PAGES.includes(page)) {
          return {
            ok: false,
            output: JSON.stringify({
              error: `Unknown page. Pages: ${VOICE_PAGES.join(", ")}.`,
            }),
          };
        }
        navigateRef.current(PAGE_ROUTES[page]);
        return { ok: true, output: JSON.stringify({ opened: page }) };
      }
      if (name === "end_conversation") {
        return {
          ok: true,
          output: JSON.stringify({ done: true }),
          endsConversation: true,
        };
      }
      return executeVoiceTool({ name, arguments: args });
    },
    [],
  );

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setProblem(null);
    setTranscript([]);
    setMuted(false);

    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      setProblem(
        "This browser cannot do voice chat. It needs microphone access over a secure (https) connection.",
      );
      return;
    }

    // Created synchronously in the click so the browser lets audio start.
    const session = new RealtimeSession({
      onStatus: setStatus,
      onTranscript: setTranscript,
      onMicLevel: setMicLevel,
      onEnded: (endProblem) => {
        if (sessionRef.current === session) sessionRef.current = null;
        setStatus("idle");
        if (endProblem) setProblem(endProblem);
      },
      runTool,
    });
    sessionRef.current = session;
    setStatus("connecting");

    try {
      await session.openMicrophone();
      const grant = await createVoiceSession({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      session.connect(grant);
    } catch (error) {
      console.error("[voice] failed to start:", error);
      session.close();
      setProblem(describeStartFailure(error));
    }
  }, [runTool]);

  const stop = useCallback(() => sessionRef.current?.close(), []);

  const toggleMuted = useCallback(() => {
    sessionRef.current?.setMuted(!muted);
    setMuted(!muted);
  }, [muted]);

  useEffect(() => () => sessionRef.current?.close(), []);

  return {
    status,
    isActive: status !== "idle",
    transcript,
    micLevel,
    muted,
    problem,
    start,
    stop,
    toggleMuted,
  };
}
