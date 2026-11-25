import { supabase } from './supabase';

export async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function saveSentenceResult(exerciseId: number, correct: boolean): Promise<void> {
  await fetch('/api/progress/sentence', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ exercise_id: exerciseId, correct }),
  });
}

export async function saveWordResult(lemma: string, language: string, correct: boolean): Promise<void> {
  await fetch('/api/progress/word', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ lemma, language, correct }),
  });
}

export async function saveLessonWordResult(conceptId: number, learning: string, correct: boolean): Promise<void> {
  const res = await fetch('/api/progress/lesson-word', {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ concept_id: conceptId, learning, correct }),
  });
  if (!res.ok) throw new Error(`Could not save the word result (${res.status})`);
}

export async function getAllSentenceProgress(): Promise<Record<string, { correct: number; attempts: number; updated_at: string }>> {
  const res  = await fetch('/api/progress/sentences', { headers: await authHeaders() });
  const data = await res.json();
  return data.progress ?? {};
}
