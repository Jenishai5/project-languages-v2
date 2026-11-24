const ARTICLES: Record<string, string[]> = {
  eng: ["the", "a", "an", "to"],
  spa: ["el", "la", "los", "las", "un", "una", "unos", "unas"],
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function targetsFor(term: string, lang: string): string[] {
  const articles = ARTICLES[lang] ?? [];
  return term
    .split("/")
    .map(variant => normalize(variant).split(" ").filter(Boolean))
    .map(words => (words.length > 1 && articles.includes(words[0]) ? words.slice(1) : words))
    .filter(words => words.length > 0)
    .map(words => words.join(" "));
}

export function heardWord(transcripts: string[], term: string, lang: string): boolean {
  const targets = targetsFor(term, lang);
  return transcripts.some(transcript => {
    const heard = ` ${normalize(transcript)} `;
    return targets.some(target => heard.includes(` ${target} `));
  });
}

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative>>;
}

export interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

type RecognitionConstructor = new () => Recognition;

export function getRecognition(): RecognitionConstructor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function transcriptsOf(event: RecognitionEvent): string[] {
  const first = event.results[0];
  if (!first) return [];
  return Array.from(first, alternative => alternative.transcript);
}
