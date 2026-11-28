import { getJson, type LangCode } from "./lessonsApi";
import { authHeaders } from "./progressService";
import { errorMessage } from "./apiError";

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

export interface WeakWord {
  concept_id:  number;
  slug:        string;
  word:        string;
  translation: string;
  emoji:       string | null;
  attempts:    number;
  correct:     number;
}

export interface WordHelp {
  concept_id:      number;
  word:            string;
  translation:     string;
  available:       boolean;
  examples:        { sentence: string; translation: string }[];
  synonyms:        string[];
  antonyms:        string[];
  tip:             string | null;
  cached:          boolean;
  message:         string | null;
  remaining_today: number;
}

export async function fetchWeakWords(learning: LangCode, native: LangCode, lessonId?: number): Promise<WeakWord[]> {
  const params = new URLSearchParams({ learning, native });
  if (lessonId !== undefined) params.set("lesson_id", String(lessonId));
  const data = await getJson<{ words: WeakWord[] }>(`/api/agents/vocabulary/weak?${params}`, { headers: await authHeaders() });
  return data.words;
}

export async function getWordHelp(conceptId: number, learning: LangCode, native: LangCode): Promise<WordHelp> {
  return getJson<WordHelp>("/api/agents/vocabulary/help", {
    method:  "POST",
    headers: await authHeaders(),
    body:    JSON.stringify({ concept_id: conceptId, learning, native }),
  });
}

export interface Correction {
  wrong: string;
  right: string;
  why:   string;
}

export interface PartnerReply {
  available:       boolean;
  reply:           string | null;
  correction:      Correction | null;
  message:         string | null;
  remaining_today: number;
}

export interface ConversationStart extends PartnerReply {
  word:         string;
  sentence:     string;
  lesson_words: string[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ConversationSummary {
  words_used:     string[];
  mistakes_saved: number;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  return getJson<T>(url, { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
}

export function startConversation(mnemonicId: number, learning: LangCode, native: LangCode): Promise<ConversationStart> {
  return post("/api/agents/conversation/start", { mnemonic_id: mnemonicId, learning, native });
}

export function sendConversationTurn(
  mnemonicId: number,
  learning: LangCode,
  native: LangCode,
  history: ChatTurn[],
  message: string,
): Promise<PartnerReply> {
  return post("/api/agents/conversation/turn", { mnemonic_id: mnemonicId, learning, native, history: history.slice(-8), message });
}

export function finishConversation(
  mnemonicId: number,
  learning: LangCode,
  native: LangCode,
  messages: string[],
  corrections: Correction[],
): Promise<ConversationSummary> {
  return post("/api/agents/conversation/finish", { mnemonic_id: mnemonicId, learning, native, messages, corrections });
}

export interface CultureNote {
  concept_id:      number;
  word:            string;
  translation:     string;
  available:       boolean;
  note:            string | null;
  expressions:     { phrase: string; meaning: string }[];
  fun_fact:        string | null;
  cached:          boolean;
  message:         string | null;
  remaining_today: number;
}

export function getCultureNote(conceptId: number, learning: LangCode, native: LangCode): Promise<CultureNote> {
  return post("/api/agents/cultural/explain", { concept_id: conceptId, learning, native });
}

export interface PronunciationResult {
  available:       boolean;
  heard:           boolean;
  text:            string;
  recognized:      string | null;
  pronunciation:   number | null;
  accuracy:        number | null;
  fluency:         number | null;
  completeness:    number | null;
  words:           { word: string; accuracy: number; error: string }[];
  weak_sounds:     string[];
  verdict:         string | null;
  message:         string | null;
  remaining_today: number;
}

export async function pronunciationSupported(learning: LangCode): Promise<boolean> {
  const params = new URLSearchParams({ learning });
  const data = await getJson<{ supported: boolean }>(`/api/agents/pronunciation/support?${params}`, { headers: await authHeaders() });
  return data.supported;
}

export async function assessPronunciation(learning: LangCode, text: string, audio: Blob): Promise<PronunciationResult> {
  const params = new URLSearchParams({ learning, text });
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "audio/wav");
  return getJson<PronunciationResult>(`/api/agents/pronunciation/assess?${params}`, { method: "POST", headers, body: audio });
}

export interface AiUsageToday {
  used_today:      number;
  daily_limit:     number;
  remaining_today: number;
  by_agent:        Record<string, number>;
  is_admin:        boolean;
}

export async function fetchAiUsage(): Promise<AiUsageToday> {
  return getJson<AiUsageToday>("/api/agents/usage", { headers: await authHeaders() });
}

export type AgentName = "grammar" | "vocabulary" | "conversation" | "pronunciation" | "cultural";

export interface AgentDay {
  day:      string;
  calls:    number;
  failures: number;
  tokens:   number;
}

export interface AgentUsage {
  agent:        AgentName;
  calls:        number;
  failures:     number;
  failure_rate: number;
  tokens:       number;
  learners:     number;
  models:       string[];
  last_call_at: string | null;
  daily:        AgentDay[];
}

export interface AiUsageSummary {
  days:         number;
  generated_at: string;
  agents:       AgentUsage[];
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchAiUsageSummary(days: number): Promise<AiUsageSummary> {
  const res  = await fetch(`/api/agents/usage/summary?days=${days}`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(errorMessage(data, res.status), res.status);
  }
  return data as AiUsageSummary;
}

export type AgentState = "idle" | "waiting" | "thinking" | "working" | "success" | "error" | "blocked";

export interface AgentLive {
  agent:            AgentName;
  state:            AgentState;
  detail:           string;
  queued:           number;
  running:          number;
  running_ms:       number | null;
  average_ms:       number | null;
  last_finished_at: string | null;
  last_succeeded:   boolean | null;
  calls_today:      number;
  failures_today:   number;
  last_call_at:     string | null;
}

export interface AgentEvent {
  id:         number;
  agent:      AgentName;
  model:      string;
  succeeded:  boolean;
  tokens:     number | null;
  created_at: string;
}

export interface AgentsLive {
  generated_at:   string;
  tracking_since: string;
  agents:         AgentLive[];
  recent:         AgentEvent[];
}

export async function fetchAgentsLive(): Promise<AgentsLive> {
  const res  = await fetch("/api/agents/live", { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(errorMessage(data, res.status), res.status);
  }
  if (!Array.isArray(data.agents) || !Array.isArray(data.recent)) throw new ApiError("Unexpected live data.", res.status);
  return data as AgentsLive;
}
