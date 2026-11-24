export type Training = "match" | "shuffle" | "pronounce" | "picture";

export interface TrainingResult {
  correct: number;
  total:   number;
}

export const TRAININGS: { id: Training; icon: string; title: string; hint: string }[] = [
  { id: "match",     icon: "🧩", title: "Match",     hint: "Word ↔ translation" },
  { id: "shuffle",   icon: "🔀", title: "Shuffle",   hint: "Build 5 sentences" },
  { id: "pronounce", icon: "🎤", title: "Pronounce", hint: "Say each word" },
  { id: "picture",   icon: "🖼️", title: "Picture",   hint: "Picture → word" },
];
