import { getJson, type LangCode } from "./lessonsApi";
import { authHeaders } from "./progressService";

export interface GrammarMistake {
  wrong: string;
  right: string;
  why:   string;
}

export interface GrammarCheck {
  correct:         boolean;
  available:       boolean;
  explanation:     string | null;
  mistakes:        GrammarMistake[];
  tip:             string | null;
  cached:          boolean;
  message:         string | null;
  remaining_today: number;
}

export async function checkGrammar(
  sentenceId: number,
  answer: string[],
  learning: LangCode,
  native: LangCode,
): Promise<GrammarCheck> {
  return getJson<GrammarCheck>("/api/agents/grammar/check", {
    method:  "POST",
    headers: await authHeaders(),
    body:    JSON.stringify({ sentence_id: sentenceId, answer, learning, native }),
  });
}
