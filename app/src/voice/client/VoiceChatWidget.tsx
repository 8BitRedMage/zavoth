import { ChevronDown, ExternalLink, Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocalStorage } from "../../client/hooks/useLocalStorage";
import aiOrb from "../../client/static/ai-orb.svg";
import { cn } from "../../client/utils";
import type { VoiceLink } from "../shared";
import type { TranscriptEntry, VoiceStatus } from "./realtimeSession";
import { useVoiceChat } from "./useVoiceChat";

const STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: "READY • LOW LATENCY",
  connecting: "CONNECTING…",
  listening: "LISTENING",
  thinking: "WORKING…",
  speaking: "SPEAKING",
};

/**
 * The "Ask Zavoth" voice assistant. Lives in the app shell rather than on a
 * page, so a conversation keeps going while the assistant (or the user)
 * moves between pages.
 */
export function VoiceChatWidget() {
  const voice = useVoiceChat();
  const [expanded, setExpanded] = useLocalStorage(
    "voice-widget-expanded",
    typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={
          voice.isActive ? "Show voice chat (in progress)" : "Open Ask Zavoth"
        }
        className={cn(
          "bg-console-surface border-console-border hover:border-console-dim fixed bottom-6 right-6 z-30 flex size-14 cursor-pointer items-center justify-center rounded-full border shadow-[0px_12px_32px_0px_rgba(0,0,0,0.4)] transition-colors",
          voice.isActive && "border-console-mint",
        )}
      >
        <Orb status={voice.status} micLevel={voice.micLevel} size="size-9" />
      </button>
    );
  }

  return (
    <aside
      aria-label="Ask Zavoth voice assistant"
      className="bg-console-surface border-console-border fixed bottom-6 right-6 z-30 flex w-[min(300px,calc(100vw-3rem))] flex-col items-center gap-5 rounded-2xl border px-6 pb-5 pt-7 shadow-[0px_12px_32px_0px_rgba(0,0,0,0.4)]"
    >
      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-label="Minimize"
        className="text-console-subtle hover:text-console-fg absolute right-3 top-3 cursor-pointer rounded-md p-1 transition-colors"
      >
        <ChevronDown className="size-4" aria-hidden="true" />
      </button>

      <Orb status={voice.status} micLevel={voice.micLevel} size="size-20" />

      {voice.isActive ? (
        <>
          <Transcript entries={voice.transcript} />
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={voice.toggleMuted}
              aria-pressed={voice.muted}
              className={cn(
                "border-console-border text-console-fg hover:border-console-dim flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border text-[13px] font-semibold transition-colors",
                voice.muted && "bg-console-raised text-console-orange",
              )}
            >
              {voice.muted ? (
                <MicOff className="size-3.5" aria-hidden="true" />
              ) : (
                <Mic className="size-3.5" aria-hidden="true" />
              )}
              {voice.muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={voice.stop}
              className="bg-console-raised text-console-fg hover:bg-console-border flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-semibold transition-colors"
            >
              <PhoneOff className="size-3.5" aria-hidden="true" />
              End
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="text-console-fg text-base font-semibold">
              Ask Zavoth
            </p>
            <p className="text-console-muted text-xs">
              Voice-powered analytics assistant
            </p>
          </div>
          <button
            type="button"
            onClick={voice.start}
            className="bg-console-mint text-console-mint-foreground hover:bg-console-mint/90 flex h-8 w-full cursor-pointer items-center justify-center rounded-[10px] text-[13px] font-semibold transition-colors"
          >
            Start Voice Chat
          </button>
        </>
      )}

      {voice.problem && (
        <p role="alert" className="text-console-orange text-center text-xs">
          {voice.problem}
        </p>
      )}

      <p className="text-console-subtle font-mono text-[9px] font-medium tracking-[0.72px]">
        {voice.muted && voice.isActive ? "MUTED" : STATUS_LABELS[voice.status]}
      </p>
    </aside>
  );
}

function Orb({
  status,
  micLevel,
  size,
}: {
  status: VoiceStatus;
  micLevel: number;
  size: string;
}) {
  return (
    <div className={cn("relative shrink-0", size)}>
      {status === "speaking" && (
        <span
          aria-hidden="true"
          className="bg-console-mint/30 absolute inset-0 animate-ping rounded-full"
        />
      )}
      <img
        src={aiOrb}
        alt=""
        // While listening the orb swells with the mic level, which doubles as
        // proof that the microphone is actually picking the user up.
        style={
          status === "listening"
            ? { transform: `scale(${1 + micLevel * 0.25})` }
            : undefined
        }
        className={cn(
          "relative size-full transition-transform duration-100",
          (status === "connecting" || status === "thinking") && "animate-pulse",
        )}
      />
    </div>
  );
}

function Transcript({ entries }: { entries: TranscriptEntry[] }) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [entries]);

  const visible = entries.filter((entry) => entry.text || entry.pending);
  const latestLinkId = visible.findLast((entry) => entry.link)?.id;

  return (
    <div
      ref={logRef}
      role="log"
      aria-label="Conversation transcript"
      className="flex max-h-72 min-h-16 w-full flex-col gap-2 overflow-y-auto text-xs"
    >
      {visible.length === 0 && (
        <p className="text-console-subtle m-auto text-center">
          Just start talking.
        </p>
      )}
      {visible.map((entry) =>
        entry.link ? (
          <LinkCard
            key={entry.id}
            link={entry.link}
            pinned={entry.id === latestLinkId}
          />
        ) : entry.role === "tool" || entry.role === "system" ? (
          <p
            key={entry.id}
            className={cn(
              "text-console-subtle font-mono text-[10px]",
              entry.failed && "text-console-orange",
            )}
          >
            {entry.role === "tool"
              ? `${entry.pending ? "▸" : entry.failed ? "✕" : "✓"} ${
                  entry.text
                }`
              : entry.text}
          </p>
        ) : (
          <p
            key={entry.id}
            className={cn(
              entry.role === "user"
                ? "text-console-muted self-end text-right"
                : "text-console-fg",
            )}
          >
            {entry.text || "…"}
          </p>
        ),
      )}
    </div>
  );
}

/**
 * A link the assistant has handed over, e.g. a company's LinkedIn page. It is
 * a real link the user clicks, not a tab opened for them: browsers block
 * unprompted pop-ups, and a click makes it plainly the user's own visit.
 */
function LinkCard({ link, pinned }: { link: VoiceLink; pinned: boolean }) {
  return (
    // The newest card stays in view while the questions are being asked, so
    // the link and what to look for are there when the user glances back.
    <div
      className={cn(
        "bg-console-surface shrink-0 rounded-lg",
        pinned && "sticky top-0 z-10",
      )}
    >
      <div className="border-console-mint/40 bg-console-mint/10 rounded-lg border">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-console-mint/10 flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors"
        >
          <ExternalLink
            className="text-console-mint size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="text-console-fg block truncate text-[13px] font-semibold">
              {link.label}
            </span>
            {link.hint && (
              <span className="text-console-muted block text-[11px]">
                {link.hint}
              </span>
            )}
          </span>
        </a>
        {link.checklist && link.checklist.length > 0 && (
          <div className="border-console-mint/20 border-t px-3 py-2">
            <p className="text-console-subtle font-mono text-[9px] font-medium tracking-[0.72px]">
              LOOK FOR
            </p>
            <ol className="text-console-muted mt-1 list-decimal space-y-0.5 pl-4 text-[11px]">
              {link.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
