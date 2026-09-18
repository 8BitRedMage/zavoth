import type { VoiceLink, VoiceSessionGrant, VoiceToolResult } from "../shared";
import { AudioPlayer, MicCapture, pickInputRate } from "./audio";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  /** A link the tool call produced for the user to click. */
  link?: VoiceLink;
  /** Still being transcribed, spoken or executed. */
  pending?: boolean;
  failed?: boolean;
}

export interface RealtimeSessionHandlers {
  onStatus: (status: VoiceStatus) => void;
  onTranscript: (entries: TranscriptEntry[]) => void;
  onMicLevel: (level: number) => void;
  /** The session is over. `problem` is set when it was not the user's choice. */
  onEnded: (problem?: string) => void;
  /** Runs a tool call. `endsConversation` hangs up once the reply has played. */
  runTool: (
    name: string,
    args: string,
  ) => Promise<VoiceToolResult & { endsConversation?: boolean }>;
}

const CONNECT_TIMEOUT_MS = 15_000;
const MAX_TRANSCRIPT_ENTRIES = 100;

// https://docs.boson.ai/api-reference/realtime/server-events
interface ServerEvent {
  type: string;
  item_id?: string;
  response_id?: string;
  call_id?: string;
  name?: string;
  delta?: string;
  transcript?: string;
  item?: { id: string; type: string; role?: string };
  response?: {
    id: string;
    status: string;
    output: {
      type: string;
      status?: string;
      call_id?: string;
      name?: string;
      arguments?: string;
    }[];
  };
  error?: { type?: string; code?: string | null; message?: string };
  seconds_idle?: number;
}

const CLOSE_CODE_PROBLEMS: Record<number, string> = {
  3000: "The voice service rejected the session key. Try again.",
  4429: "The voice service is out of credit.",
};

/**
 * One live conversation with Higgs Realtime: the socket, the microphone going
 * up, the speech coming down, and the tool calls in between.
 *
 * Construct it inside the click handler, since browsers only let an
 * AudioContext start from a user gesture.
 */
export class RealtimeSession {
  private readonly context = new AudioContext();
  private readonly inputRate = pickInputRate(this.context.sampleRate);
  private readonly mic = new MicCapture(this.context, this.inputRate);
  private player?: AudioPlayer;
  private socket?: WebSocket;
  private connectTimer?: ReturnType<typeof setTimeout>;

  private ready = false;
  private ended = false;
  private status: VoiceStatus = "connecting";
  private activeResponseId?: string;
  private readonly cancelledResponseIds = new Set<string>();
  private hangUpWhenQuiet = false;
  private runningTools = false;
  private pendingProblem?: string;
  private entries: TranscriptEntry[] = [];

  constructor(private readonly handlers: RealtimeSessionHandlers) {}

  /** Prompts for the mic. Do this before minting the short-lived session key. */
  async openMicrophone(): Promise<void> {
    await this.context.resume();
    await this.mic.start(
      (audio) => {
        if (this.ready && this.socket?.readyState === WebSocket.OPEN) {
          this.send({ type: "input_audio_buffer.append", audio });
        }
      },
      (level) => this.handlers.onMicLevel(level),
    );
  }

  connect(grant: VoiceSessionGrant): void {
    if (this.ended) return;

    const outputRate = grant.session.audio.output.format.rate;
    this.player = new AudioPlayer(this.context, outputRate);
    this.player.onIdle = () => this.onPlaybackIdle();

    const socket = new WebSocket(grant.url, [
      "realtime",
      `bai-client-secret.${grant.clientSecret}`,
    ]);
    this.socket = socket;

    this.connectTimer = setTimeout(
      () => this.end("The voice service did not respond."),
      CONNECT_TIMEOUT_MS,
    );

    socket.onopen = () => {
      const session = structuredClone(grant.session);
      session.audio.input.format.rate = this.inputRate;
      this.send({ type: "session.update", session });
    };
    socket.onmessage = ({ data }) => {
      if (typeof data !== "string") return;
      let event: ServerEvent;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      this.handleEvent(event, grant);
    };
    socket.onclose = ({ code, reason }) => {
      debug("socket closed", code, reason);
      this.end(
        this.pendingProblem ??
          CLOSE_CODE_PROBLEMS[code] ??
          (this.ready
            ? "The voice connection dropped."
            : "Could not connect to the voice service."),
      );
    };
  }

  setMuted(muted: boolean): void {
    this.mic.muted = muted;
    if (muted && this.ready) {
      // Drop the half-sentence already buffered so it is not held against
      // whatever the user says after unmuting.
      this.send({ type: "input_audio_buffer.clear" });
    }
  }

  /** Hangs up. Safe to call more than once. */
  close(): void {
    this.end();
  }

  //#region Server events

  private handleEvent(event: ServerEvent, grant: VoiceSessionGrant): void {
    if (
      event.type !== "response.output_audio.delta" &&
      event.type !== "response.output_audio_transcript.delta" &&
      event.type !== "response.output_audio_transcript.length" &&
      event.type !== "response.function_call_arguments.delta"
    ) {
      debug(event.type, event);
    }

    switch (event.type) {
      case "session.created":
        clearTimeout(this.connectTimer);
        this.ready = true;
        this.setStatus("thinking");
        this.send({
          type: "response.create",
          response: { instructions: grant.greetingInstructions },
        });
        break;

      case "input_audio_buffer.speech_started":
        // Barge-in: the user is talking, so stop talking over them. The server
        // cancels the response itself; audio already in flight is dropped.
        if (this.activeResponseId) {
          this.cancelledResponseIds.add(this.activeResponseId);
        }
        this.player?.interrupt();
        this.hangUpWhenQuiet = false;
        this.setStatus("listening");
        break;

      case "input_audio_buffer.speech_stopped":
        this.setStatus("thinking");
        break;

      case "conversation.item.added":
        // Reserve the user's line now so it sorts above the reply; the
        // transcript itself arrives later.
        if (event.item?.type === "message" && event.item.role === "user") {
          this.upsertEntry(event.item.id, { role: "user", pending: true });
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (event.item_id) {
          this.upsertEntry(event.item_id, {
            role: "user",
            text: event.transcript?.trim() ?? "",
            pending: false,
          });
        }
        break;

      case "response.created":
        this.activeResponseId = event.response?.id;
        if (this.status !== "speaking") this.setStatus("thinking");
        break;

      case "response.output_audio.delta":
        if (this.isCancelled(event.response_id) || !event.delta) break;
        this.player?.enqueue(event.delta);
        this.setStatus("speaking");
        break;

      case "response.output_audio_transcript.delta":
        if (this.isCancelled(event.response_id) || !event.item_id) break;
        this.upsertEntry(event.item_id, {
          role: "assistant",
          appendText: event.delta ?? "",
          pending: true,
        });
        break;

      case "response.output_audio_transcript.done":
        if (event.item_id && this.hasEntry(event.item_id)) {
          this.upsertEntry(event.item_id, {
            role: "assistant",
            pending: false,
          });
        }
        break;

      case "response.done":
        void this.onResponseDone(event);
        break;

      case "error":
        this.onServerError(event);
        break;

      case "session.idle_timeout":
        this.pendingProblem = "The conversation ended after a long silence.";
        break;

      case "session.max_duration_reached":
        this.pendingProblem =
          "The conversation reached its maximum length. Start a new one to continue.";
        break;
    }
  }

  private async onResponseDone(event: ServerEvent): Promise<void> {
    const response = event.response;
    if (!response) return;
    if (this.activeResponseId === response.id) {
      this.activeResponseId = undefined;
    }

    // A response that was talked over may carry a half-formed tool call.
    const calls =
      response.status === "completed"
        ? response.output.filter(
            (item) => item.type === "function_call" && item.call_id,
          )
        : [];

    if (calls.length === 0) {
      if (!this.player?.isPlaying) this.onPlaybackIdle();
      return;
    }

    this.setStatus("thinking");
    this.runningTools = true;
    let continueConversation = true;

    for (const call of calls) {
      const name = call.name ?? "";
      this.upsertEntry(call.call_id!, {
        role: "tool",
        text: name,
        pending: true,
      });

      let result: Awaited<ReturnType<RealtimeSessionHandlers["runTool"]>>;
      try {
        result = await this.handlers.runTool(name, call.arguments ?? "{}");
      } catch (error) {
        debug("tool call threw", name, error);
        result = {
          ok: false,
          output: JSON.stringify({
            error: "The app could not reach its server to do that.",
          }),
        };
      }
      if (this.ended) return;

      this.upsertEntry(call.call_id!, {
        role: "tool",
        pending: false,
        failed: !result.ok,
        link: result.link,
      });
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: result.output,
        },
      });

      if (result.endsConversation) {
        continueConversation = false;
        this.hangUpWhenQuiet = true;
      }
    }

    this.runningTools = false;
    if (continueConversation) {
      this.send({ type: "response.create" });
    } else if (!this.player?.isPlaying) {
      this.onPlaybackIdle();
    }
  }

  private onServerError(event: ServerEvent): void {
    const message = event.error?.message ?? "Unknown error";
    console.warn("[voice] server error:", event.error);

    if (!this.ready) {
      // An error before `session.created` means the config was refused.
      this.pendingProblem = `The voice service refused the session: ${message}`;
      return;
    }
    if (event.error?.type === "insufficient_quota") {
      this.pendingProblem = CLOSE_CODE_PROBLEMS[4429];
      return;
    }
    this.upsertEntry(crypto.randomUUID(), {
      role: "system",
      text: message,
      failed: true,
    });
  }

  //#endregion

  private onPlaybackIdle(): void {
    if (this.ended || this.activeResponseId || this.runningTools) return;
    if (this.hangUpWhenQuiet) {
      this.end();
      return;
    }
    if (this.status === "speaking" || this.status === "thinking") {
      this.setStatus("listening");
    }
  }

  private isCancelled(responseId: string | undefined): boolean {
    return !!responseId && this.cancelledResponseIds.has(responseId);
  }

  private send(event: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event));
    }
  }

  private setStatus(status: VoiceStatus): void {
    if (this.status === status || this.ended) return;
    this.status = status;
    this.handlers.onStatus(status);
  }

  private hasEntry(id: string): boolean {
    return this.entries.some((entry) => entry.id === id);
  }

  private upsertEntry(
    id: string,
    patch: Partial<Omit<TranscriptEntry, "id">> & {
      role: TranscriptEntry["role"];
      appendText?: string;
    },
  ): void {
    const { appendText, ...fields } = patch;
    const existing = this.entries.find((entry) => entry.id === id);
    const next: TranscriptEntry = {
      text: "",
      ...existing,
      ...fields,
      id,
    };
    if (appendText) next.text += appendText;

    this.entries = existing
      ? this.entries.map((entry) => (entry.id === id ? next : entry))
      : [...this.entries, next].slice(-MAX_TRANSCRIPT_ENTRIES);
    this.handlers.onTranscript(this.entries);
  }

  private end(problem?: string): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.connectTimer);

    this.mic.stop();
    this.player?.interrupt();
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onmessage = null;
      this.socket.close();
    }
    void this.context.close();

    this.handlers.onMicLevel(0);
    this.handlers.onEnded(problem);
  }
}

function debug(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.debug("[voice]", ...args);
  }
}
