// Walkie-talkie voice clips: record a short clip from the mic, send as base64,
// and play received clips. Works in iOS Safari (MediaRecorder, HTTPS required).

const MAX_BYTES = 480_000; // ~ keep clips small; long ones are dropped
export const MAX_VOICE_MS = 10_000; // auto-stop after 10s

let mediaStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];

export function voiceSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function pickMime(): string {
  const prefs = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const m of prefs) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // isTypeSupported missing on some engines — fall through
    }
  }
  return "";
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function bytesFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type StartResult = "ok" | "denied" | "unsupported";

/** Requests the mic and starts recording. Returns why it failed, if it did. */
export async function startRecording(): Promise<StartResult> {
  if (!voiceSupported()) return "unsupported";
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return "denied";
  }
  const mime = pickMime();
  chunks = [];
  try {
    recorder = mime
      ? new MediaRecorder(mediaStream, { mimeType: mime })
      : new MediaRecorder(mediaStream);
  } catch {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    return "unsupported";
  }
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  return "ok";
}

export interface VoiceClip {
  data: string;
  mime: string;
}

/** Stops recording and returns the clip (or null if empty/too large/not recording). */
export function stopRecording(): Promise<VoiceClip | null> {
  return new Promise((resolve) => {
    const rec = recorder;
    if (!rec) {
      resolve(null);
      return;
    }
    const cleanup = () => {
      mediaStream?.getTracks().forEach((t) => t.stop());
      mediaStream = null;
      recorder = null;
    };
    rec.onstop = async () => {
      try {
        const type = rec.mimeType || "audio/mp4";
        const blob = new Blob(chunks, { type });
        cleanup();
        if (blob.size === 0 || blob.size > MAX_BYTES) {
          resolve(null);
          return;
        }
        const buf = new Uint8Array(await blob.arrayBuffer());
        resolve({ data: base64FromBytes(buf), mime: type });
      } catch {
        cleanup();
        resolve(null);
      }
    };
    try {
      rec.stop();
    } catch {
      cleanup();
      resolve(null);
    }
  });
}

/** True while a recording is in progress. */
export function isRecording(): boolean {
  return recorder !== null && recorder.state === "recording";
}

/** Plays a received clip. */
export function playVoice(data: string, mime: string): void {
  try {
    const blob = new Blob([bytesFromBase64(data).buffer as ArrayBuffer], {
      type: mime || "audio/mp4",
    });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    void audio.play().catch(() => URL.revokeObjectURL(url));
  } catch {
    // ignore playback failures
  }
}
