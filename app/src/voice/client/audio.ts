// Browser audio plumbing for Higgs Realtime, which speaks base64 PCM16 mono.

/** Input rates the API accepts, best first. */
const SUPPORTED_INPUT_RATES = [24_000, 16_000, 8_000] as const;
const CHUNK_MS = 100;

// The worklet runs on the audio thread and downsamples the mic from the
// hardware rate to the session rate by averaging, which doubles as a cheap
// low-pass filter. It is inlined and loaded from a Blob URL so it needs no
// bundler support for worklet entry points.
const CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { targetRate, chunkSamples } = options.processorOptions;
    this.ratio = sampleRate / targetRate;
    this.chunk = new Int16Array(chunkSamples);
    this.filled = 0;
    this.sum = 0;
    this.count = 0;
    this.position = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.position++;
      if (this.position < this.ratio) continue;
      this.position -= this.ratio;
      const sample = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.chunk[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      if (this.filled === this.chunk.length) {
        const copy = this.chunk.slice();
        this.port.postMessage(copy.buffer, [copy.buffer]);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

/** Picks the highest session input rate the hardware can feed without upsampling. */
export function pickInputRate(contextRate: number): number {
  return (
    SUPPORTED_INPUT_RATES.find((rate) => contextRate >= rate) ??
    SUPPORTED_INPUT_RATES[SUPPORTED_INPUT_RATES.length - 1]
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

export class MicCapture {
  muted = false;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;

  constructor(
    private readonly context: AudioContext,
    private readonly targetRate: number,
  ) {}

  /**
   * Asks for the microphone and starts streaming. `onChunk` gets ~100ms of
   * base64 PCM16; `onLevel` gets the 0..1 loudness of the same chunk.
   */
  async start(
    onChunk: (base64: string) => void,
    onLevel: (level: number) => void,
  ): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        // Without echo cancellation the assistant hears itself through the
        // speakers and interrupts its own replies.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const moduleUrl = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET], { type: "application/javascript" }),
    );
    try {
      await this.context.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }

    this.worklet = new AudioWorkletNode(this.context, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      processorOptions: {
        targetRate: this.targetRate,
        chunkSamples: (this.targetRate * CHUNK_MS) / 1000,
      },
    });
    this.worklet.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
      if (this.muted) {
        onLevel(0);
        return;
      }
      const samples = new Int16Array(data);
      let sumOfSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i] / 0x8000;
        sumOfSquares += sample * sample;
      }
      // RMS of speech sits around 0.05-0.2; scale it into a usable 0..1.
      onLevel(Math.min(1, Math.sqrt(sumOfSquares / samples.length) * 6));
      onChunk(bytesToBase64(new Uint8Array(data)));
    };

    this.source = this.context.createMediaStreamSource(this.stream);
    this.source.connect(this.worklet);
  }

  stop(): void {
    this.source?.disconnect();
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
}

/** Plays streamed PCM16 chunks back to back, and can be cut off mid-sentence. */
export class AudioPlayer {
  /** Called whenever the queue drains and nothing is audible any more. */
  onIdle?: () => void;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly rate: number,
  ) {}

  get isPlaying(): boolean {
    return this.sources.size > 0;
  }

  enqueue(base64: string): void {
    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) return;

    // The buffer keeps the session rate; Web Audio resamples it on playback.
    const buffer = this.context.createBuffer(1, pcm.length, this.rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      channel[i] = pcm[i] / 0x8000;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.onIdle?.();
    };

    // A little lead time on the first chunk absorbs network jitter.
    const startAt = Math.max(
      this.nextStartTime,
      this.context.currentTime + 0.06,
    );
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(source);
  }

  /** Stops everything immediately, e.g. when the user talks over the assistant. */
  interrupt(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    this.nextStartTime = 0;
  }
}
