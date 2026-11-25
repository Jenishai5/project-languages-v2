import { authHeaders } from './progressService';

export type LangCode = string;

export interface Language {
  code:  LangCode;
  name:  string;
  words: number;
}

export interface LessonSummary {
  id:             number;
  slug:           string;
  title:          string;
  position:       number;
  word_count:     number;
  sentence_count: number;
}

export interface Recording {
  url:             string;
  author:          string | null;
  license:         string | null;
  attribution_url: string | null;
}

export interface LessonWord {
  concept_id:  number;
  slug:        string;
  word:        string;
  translation: string;
  emoji:       string | null;
  image_url:   string | null;
}

export interface Tile {
  form:      string;
  position:  number;
  word_type: string;
}

export interface LessonSentence {
  id:           number;
  concept_slug: string;
  full_text:    string;
  prompt:       string;
  words:        Tile[];
  level:        string;
  audio:        Recording | null;
}

export interface PictureRound {
  slug:      string;
  emoji:     string | null;
  image_url: string | null;
  options:   string[];
  answer:    string;
}

export interface LessonDetail {
  id:        number;
  slug:      string;
  title:     string;
  position:  number;
  learning:  LangCode;
  native:    LangCode;
  words:     LessonWord[];
  sentences: LessonSentence[];
  pictures:  PictureRound[];
}

export interface LanguageSettings {
  native_lang:   LangCode;
  learning_lang: LangCode;
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res  = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail ?? data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function fetchLanguages(): Promise<Language[]> {
  const data = await getJson<{ languages: Language[] }>('/api/languages');
  return data.languages;
}

export async function fetchLessons(learning: LangCode, native: LangCode): Promise<LessonSummary[]> {
  const params = new URLSearchParams({ learning, native });
  const data   = await getJson<{ lessons: LessonSummary[] }>(`/api/lessons?${params}`);
  return data.lessons;
}

export async function fetchLesson(id: number, learning: LangCode, native: LangCode): Promise<LessonDetail> {
  const params = new URLSearchParams({ learning, native });
  return getJson<LessonDetail>(`/api/lessons/${id}?${params}`);
}

export async function loadSettings(): Promise<LanguageSettings | null> {
  try {
    return await getJson<LanguageSettings>('/api/settings', { headers: await authHeaders() });
  } catch {
    return null;
  }
}

export async function saveSettings(settings: LanguageSettings): Promise<void> {
  await getJson('/api/settings', { method: 'PUT', headers: await authHeaders(), body: JSON.stringify(settings) });
}

export async function saveLessonResult(lessonId: number, correct: boolean): Promise<void> {
  await getJson('/api/progress/lesson', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ lesson_id: lessonId, correct }),
  });
}

export async function fetchLessonProgress(): Promise<Record<string, { attempts: number; correct: number; mastery: number }>> {
  try {
    const data = await getJson<{ progress: Record<string, { attempts: number; correct: number; mastery: number }> }>(
      '/api/progress/lessons',
      { headers: await authHeaders() },
    );
    return data.progress;
  } catch {
    return {};
  }
}

export const SPEECH_LANG: Record<string, 'en-US' | 'es-ES' | 'ru-RU' | 'ca-ES'> = {
  eng: 'en-US',
  spa: 'es-ES',
  rus: 'ru-RU',
  cat: 'ca-ES',
};
