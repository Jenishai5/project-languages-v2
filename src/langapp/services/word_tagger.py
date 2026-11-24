import re

PRONOUNS = {
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs",
    "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",
    "this", "that", "these", "those", "who", "whom", "whose", "what", "which",
    "someone", "something", "anyone", "anything", "everyone", "everything", "nobody", "nothing",
}
ARTICLES = {"a", "an", "the"}
PREPOSITIONS = {
    "about", "above", "across", "after", "against", "along", "among", "around", "at", "before",
    "behind", "below", "beside", "between", "by", "during", "for", "from", "in", "inside", "into",
    "near", "of", "off", "on", "onto", "out", "over", "through", "to", "toward", "towards",
    "under", "until", "up", "upon", "with", "without",
}
CONJUNCTIONS = {"and", "but", "or", "so", "because", "if", "when", "while", "although", "than"}
VERBS = {
    "am", "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "have", "has", "had",
    "can", "could", "will", "would", "shall", "should", "may", "might", "must",
    "go", "goes", "went", "come", "came", "get", "got", "make", "made", "know", "knew", "think",
    "thought", "see", "saw", "want", "wanted", "like", "liked", "love", "loved", "need", "eat", "ate",
    "drink", "drank", "say", "said", "tell", "told", "give", "gave", "take", "took", "stay", "live",
    "work", "play", "read", "write", "speak", "buy", "bought", "help", "look", "find", "found",
    "feel", "felt", "leave", "left", "keep", "kept", "let", "put", "run", "ran", "sleep", "slept",
}
ADVERBS = {
    "not", "very", "too", "also", "now", "then", "here", "there", "today", "tomorrow", "yesterday",
    "always", "never", "often", "sometimes", "already", "still", "again", "soon", "really", "just",
    "where", "how", "why",
}
ADJECTIVES = {
    "good", "bad", "big", "small", "new", "old", "young", "happy", "sad", "proud", "simple",
    "easy", "hard", "difficult", "beautiful", "hot", "cold", "long", "short", "tall", "busy",
    "tired", "hungry", "dead", "free", "late", "early", "important", "sure", "right", "wrong",
}
SUFFIX_RULES = (
    ("ly", "adverb"),
    ("ness", "noun"),
    ("tion", "noun"),
    ("ment", "noun"),
    ("ful", "adjective"),
    ("ous", "adjective"),
    ("ive", "adjective"),
    ("able", "adjective"),
)
WORD_CHARS = re.compile(r"[^\w']+")


def _bare(word: str) -> str:
    return WORD_CHARS.sub("", word).lower().replace("'s", "")


def tag_word(word: str) -> str:
    bare = _bare(word)
    if not bare:
        return ""
    if "'" in bare:
        return "verb" if bare.endswith(("n't", "'m", "'re", "'ll", "'ve", "'d")) else "pronoun"
    for words, label in (
        (PRONOUNS, "pronoun"),
        (ARTICLES, "article"),
        (PREPOSITIONS, "preposition"),
        (CONJUNCTIONS, "conjunction"),
        (VERBS, "verb"),
        (ADVERBS, "adverb"),
        (ADJECTIVES, "adjective"),
    ):
        if bare in words:
            return label
    for suffix, label in SUFFIX_RULES:
        if len(bare) > len(suffix) + 2 and bare.endswith(suffix):
            return label
    return ""
