import pytest

from langapp.ingestion.parser import ParsePageError, parse_page
from tests.conftest import load_fixture


def test_parses_real_tatoeba_page():
    result = parse_page(load_fixture("tatoeba_page.json"))

    assert [s.id for s in result.sentences] == [14132454, 14132322, 14132239]
    assert result.issues == []

    first = result.sentences[0]
    assert first.lang == "spa"
    assert first.owner == "carlosalberto"
    assert {t.lang for t in first.translations} == {"eng", "rus"}

    direct = result.sentences[2].translations[0]
    assert direct.is_direct is True
    assert direct.owner == "Ergulis"


def test_messy_page_keeps_good_records_and_reports_bad_ones():
    result = parse_page(load_fixture("tatoeba_page_messy.json"))

    assert [s.id for s in result.sentences] == [101, 105, 106]

    reasons = " | ".join(issue.reason for issue in result.issues)
    issue_ids = [issue.record_id for issue in result.issues]
    assert "abc" in issue_ids
    assert 103 in issue_ids
    assert 104 in issue_ids
    assert "translation skipped" in reasons
    assert "translations is not a list" in reasons
    assert "record is not a JSON object" in reasons


def test_cleans_text_and_optional_fields():
    sentence = parse_page(load_fixture("tatoeba_page_messy.json")).sentences[0]

    assert sentence.text == "Hola, mundo."
    assert sentence.lang == "spa"
    assert sentence.license is None
    assert sentence.owner is None
    assert sentence.is_unapproved is False


def test_drops_duplicate_bad_and_self_translations():
    sentence = parse_page(load_fixture("tatoeba_page_messy.json")).sentences[0]

    assert [t.id for t in sentence.translations] == [201]


def test_missing_translations_become_empty():
    sentences = parse_page(load_fixture("tatoeba_page_messy.json")).sentences

    assert sentences[1].translations == ()
    assert sentences[2].translations == ()


@pytest.mark.parametrize("payload", [None, [], {}, {"data": "nope"}])
def test_rejects_responses_without_data_list(payload):
    with pytest.raises(ParsePageError):
        parse_page(payload)
