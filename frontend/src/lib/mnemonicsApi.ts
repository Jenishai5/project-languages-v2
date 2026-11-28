import { errorMessage } from "./apiError";
import { getJson, type LangCode } from "./lessonsApi";
import { authHeaders } from "./progressService";

export interface Mnemonic {
  id:              number;
  concept_id:      number;
  slug:            string;
  word:            string;
  translation:     string;
  emoji:           string | null;
  sentence:        string;
  masked_sentence: string;
  image_url:       string | null;
  created_at:      string;
}

export interface MnemonicList {
  mnemonics:        Mnemonic[];
  daily_limit:      number;
  remaining_today:  number;
  pictures_enabled: boolean;
}

export async function fetchMnemonics(learning: LangCode, native: LangCode): Promise<MnemonicList> {
  const params = new URLSearchParams({ learning, native });
  return getJson<MnemonicList>(`/api/mnemonics?${params}`, { headers: await authHeaders() });
}

export interface SavedMnemonic {
  card:     Mnemonic;
  replayed: boolean;
}

export async function saveMnemonic(
  conceptId: number,
  learning: LangCode,
  native: LangCode,
  sentence: string,
  idempotencyKey: string,
): Promise<SavedMnemonic> {
  const res = await fetch("/api/mnemonics", {
    method:  "POST",
    headers: { ...(await authHeaders()), "Idempotency-Key": idempotencyKey },
    body:    JSON.stringify({ concept_id: conceptId, learning, native, sentence }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorMessage(data, res.status));
  return { card: data as Mnemonic, replayed: res.headers.get("Idempotent-Replayed") === "true" };
}
