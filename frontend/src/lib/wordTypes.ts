const SHORT_LABELS: Record<string, string> = {
  noun:         "noun",
  verb:         "verb",
  adjective:    "adj",
  adverb:       "adv",
  pronoun:      "pron",
  preposition:  "prep",
  conjunction:  "conj",
  interjection: "interj",
  article:      "art",
};

export function wordTypeLabel(type: string): string {
  return SHORT_LABELS[type] ?? type;
}

export const WORD_TYPE_LEGEND = [
  { type: "noun",        label: "Noun"        },
  { type: "verb",        label: "Verb"        },
  { type: "adjective",   label: "Adjective"   },
  { type: "adverb",      label: "Adverb"      },
  { type: "pronoun",     label: "Pronoun"     },
  { type: "preposition", label: "Preposition" },
  { type: "article",     label: "Article"     },
  { type: "conjunction", label: "Conjunction" },
];
