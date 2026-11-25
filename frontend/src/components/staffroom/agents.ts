import type { AgentName } from "../../lib/agentsApi";

export type Hair = "bun" | "short" | "curly" | "long" | "beard";
export type Prop = "pen" | "book" | "bubble" | "mic" | "globe";

export interface AgentLook {
  name:    string;
  subject: string;
  role:    string;
  color:   string;
  skin:    string;
  hair:    Hair;
  hairColor: string;
  prop:    Prop;
}

export const AGENT_LOOKS: Record<AgentName, AgentLook> = {
  grammar: {
    name: "Greta", subject: "Grammar", role: "Checks shuffled sentences and explains the mistakes.",
    color: "#f47230", skin: "#f1c9a5", hair: "bun", hairColor: "#5a3b2a", prop: "pen",
  },
  vocabulary: {
    name: "Victor", subject: "Vocabulary", role: "Gives synonyms, antonyms and memory tips for hard words.",
    color: "#00b894", skin: "#8d5524", hair: "short", hairColor: "#1f1a17", prop: "book",
  },
  conversation: {
    name: "Carla", subject: "Conversation", role: "Chats with learners about their picture cards.",
    color: "#257de0", skin: "#e0ac7e", hair: "curly", hairColor: "#2b211c", prop: "bubble",
  },
  pronunciation: {
    name: "Paco", subject: "Pronunciation", role: "Scores how learners say words, with Azure Speech.",
    color: "#ee7fac", skin: "#c68b59", hair: "beard", hairColor: "#3a2a20", prop: "mic",
  },
  cultural: {
    name: "Chiara", subject: "Culture", role: "Explains how native speakers really use words.",
    color: "#f2a600", skin: "#f5d0b5", hair: "long", hairColor: "#a0522d", prop: "globe",
  },
};

export type Mood = "walking" | "idle" | "tired";

export function moodOf(calls: number, failureRate: number): Mood {
  if (calls === 0) return "idle";
  if (failureRate >= 0.2) return "tired";
  return "walking";
}
