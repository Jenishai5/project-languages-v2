import pytest

from langapp.services.games import UnknownGameMode, check_word_match_mode, estimate_level, tokenize
from langapp.services.word_tagger import tag_word


def test_tokenize_keeps_order_and_strips_final_punctuation():
    tokens = tokenize("If it rains, we will stay home.")

    assert [t.form for t in tokens] == ["If", "it", "rains,", "we", "will", "stay", "home"]
    assert [t.position for t in tokens] == list(range(7))


def test_tokenize_keeps_question_inside_and_strips_last_mark():
    tokens = tokenize("That book is mine. Where is yours?")

    assert tokens[3].form == "mine."
    assert tokens[-1].form == "yours"


@pytest.mark.parametrize(
    ("word", "expected"),
    [
        ("Dad", ""),
        ("is", "verb"),
        ("his", "pronoun"),
        ("of", "preposition"),
        ("The", "article"),
        ("proud", "adjective"),
        ("quickly", "adverb"),
        ("don't", "verb"),
        ("rains,", ""),
        ("happiness", "noun"),
    ],
)
def test_tag_word(word, expected):
    assert tag_word(word) == expected


@pytest.mark.parametrize(("count", "level"), [(3, "A1"), (5, "A1"), (6, "A2"), (8, "A2"), (9, "B1")])
def test_estimate_level(count, level):
    assert estimate_level(count) == level


def test_word_match_modes():
    assert check_word_match_mode("en-es") == "en-es"
    with pytest.raises(UnknownGameMode, match="Image modes"):
        check_word_match_mode("en-image")
    with pytest.raises(UnknownGameMode, match="Unknown language"):
        check_word_match_mode("xx-yy")
