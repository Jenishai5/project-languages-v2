import type { Recording } from "./lessonsApi";

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

let currentAudio: HTMLAudioElement | null = null;

export function playRecording(recording: Recording | null, fallback: () => void) {
  currentAudio?.pause();
  if (!recording) {
    fallback();
    return;
  }
  const audio = new Audio(recording.url);
  currentAudio = audio;
  audio.play().catch(fallback);
}
