import { getJson, type LangCode } from "./lessonsApi";
import { authHeaders } from "./progressService";

export interface Mnemonic {
  id:          number;
  concept_id:  number;
  slug:        string;
  word:        string;
  translation: string;
  emoji:       string | null;
  mnemonic:    string;
  image_url:   string | null;
  created_at:  string;
}

export interface MnemonicList {
  mnemonics:       Mnemonic[];
  daily_limit:     number;
  remaining_today: number;
}

export async function fetchMnemonics(learning: LangCode, native: LangCode): Promise<MnemonicList> {
  const params = new URLSearchParams({ learning, native });
  return getJson<MnemonicList>(`/api/mnemonics?${params}`, { headers: await authHeaders() });
}

export async function createMnemonic(conceptId: number, learning: LangCode, native: LangCode): Promise<Mnemonic> {
  return getJson<Mnemonic>("/api/mnemonics", {
    method:  "POST",
    headers: await authHeaders(),
    body:    JSON.stringify({ concept_id: conceptId, learning, native }),
  });
}
