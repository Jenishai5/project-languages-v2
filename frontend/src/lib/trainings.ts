import matchIcon from "../assets/felt-icons/match.webp";
import pictureIcon from "../assets/felt-icons/picture.webp";
import pronounceIcon from "../assets/felt-icons/pronounce.webp";
import shuffleIcon from "../assets/felt-icons/shuffle.webp";

export type Training = "match" | "shuffle" | "pronounce" | "picture";

export interface TrainingResult {
  correct: number;
  total:   number;
}

export interface TrainingInfo {
  id:      Training;
  icon:    string;
  image:   string;
  title:   string;
  hint:    string;
  minutes: number;
  color:   "pink" | "lime" | "mint" | "cream";
}

export const TRAININGS: TrainingInfo[] = [
  { id: "match",     icon: "🧩", image: matchIcon,     title: "Match",     hint: "Pair 5 words with their translation", minutes: 1, color: "pink" },
  { id: "shuffle",   icon: "🔀", image: shuffleIcon,   title: "Shuffle",   hint: "Put 10 sentences in order",           minutes: 3, color: "lime" },
  { id: "pronounce", icon: "🎤", image: pronounceIcon, title: "Pronounce", hint: "Say each word out loud",              minutes: 3, color: "mint" },
  { id: "picture",   icon: "🖼️", image: pictureIcon,   title: "Picture",   hint: "Pick the word for each picture",      minutes: 2, color: "cream" },
];
