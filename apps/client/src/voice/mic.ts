/** The mic stream, or why there isn't one (shown to the player, who is then listen-only). */
export async function getMic(): Promise<{ stream: MediaStream } | { stream: null; error: string }> {
  // Insecure context (plain http on a LAN or tailnet IP): the API doesn't exist.
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, error: "The mic needs HTTPS. Open this page over https://." };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return { stream };
  } catch (err) {
    console.warn("[voice] mic unavailable", err);
    const name = err instanceof DOMException ? err.name : "";
    const error =
      name === "NotAllowedError"
        ? "Mic permission is blocked. Allow it in the browser's site settings (and for the browser app in the phone's settings), then rejoin."
        : name === "NotFoundError"
          ? "No microphone found."
          : name === "NotReadableError"
            ? "The mic is busy in another app. Close it, then rejoin."
            : `Mic error: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`;
    return { stream: null, error };
  }
}

const THRESHOLD = 0.02; // RMS level that counts as speech
// Keep "speaking" on after the level drops, long enough to bridge the gaps between words: every flip is a
// message to the server and a patch to everyone.
const HOLD_MS = 600;

/** Polls the mic level and reports speaking on/off transitions. Returns a stop function. */
export function watchSpeaking(ctx: AudioContext, stream: MediaStream, onChange: (speaking: boolean) => void) {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  let speaking = false;
  let lastLoud = 0;
  const timer = setInterval(() => {
    const enabled = stream.getAudioTracks().some((t) => t.enabled);
    const now = performance.now();
    // Muted: nothing to measure.
    if (enabled) {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      if (Math.sqrt(sum / buf.length) > THRESHOLD) lastLoud = now;
    }
    const next = enabled && now - lastLoud < HOLD_MS;
    if (next !== speaking) {
      speaking = next;
      onChange(speaking);
    }
  }, 100);

  return () => {
    clearInterval(timer);
    source.disconnect();
  };
}
