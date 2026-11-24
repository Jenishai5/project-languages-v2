from pathlib import Path

import pytest

from langapp.ingestion.dictionary_parser import (
    DictionaryFileError,
    load_dictionary_file,
    pair_from_file_name,
    parse_dictionary,
)

DICTIONARIES = Path(__file__).resolve().parent.parent / "data" / "dictionaries"


def test_pair_comes_from_file_name():
    assert pair_from_file_name(Path("dictionary-en-es.json")) == "en-es"
    assert pair_from_file_name(Path("dictionary-es-emojis.json")) == "es-emojis"
    with pytest.raises(DictionaryFileError):
        pair_from_file_name(Path("words.json"))


def test_real_files_parse_without_issues():
    total = 0
    for path in sorted(DICTIONARIES.glob("dictionary-*.json")):
        pairs, issues = load_dictionary_file(path)
        assert issues == []
        assert pairs
        total += len(pairs)
    assert total > 600


def test_same_word_with_two_meanings_is_kept_twice():
    pairs, _ = load_dictionary_file(DICTIONARIES / "dictionary-en-es.json")

    fish = sorted(p.target_text for p in pairs if p.source_text == "fish")
    assert fish == ["el pescado", "pez"]


def test_bad_entries_are_reported_and_exact_duplicates_dropped():
    payload = {
        "food": {"apple": "la manzana", "  ": "vacío", "bread": 42},
        "more": {"apple": "la manzana", "milk": " la  leche "},
        "broken": ["not", "an", "object"],
    }

    pairs, issues = parse_dictionary(payload, "en-es")

    assert [(p.source_text, p.target_text) for p in pairs] == [("apple", "la manzana"), ("milk", "la leche")]
    assert len(issues) == 3
