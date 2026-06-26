import pytest
from lib.metadata import build_qdrant_filter, merge_filters, parse_tags, compute_facets


def test_parse_tags_comma_separated():
    assert parse_tags("finance, legal, hr") == ["finance", "legal", "hr"]


def test_parse_tags_json_array():
    assert parse_tags('["a", "b"]') == ["a", "b"]


def test_build_qdrant_filter_doc_ids():
    f = build_qdrant_filter({"doc_ids": [1, 2]})
    assert f is not None
    assert len(f.must) == 1


def test_build_qdrant_filter_tags_any():
    f = build_qdrant_filter({"tags": {"values": ["policy"], "mode": "any"}})
    assert f is not None


def test_merge_filters():
    default = {"doc_ids": [1]}
    override = {"source_type": "pdf"}
    merged = merge_filters(default, override)
    assert merged["doc_ids"] == [1]
    assert merged["source_type"] == "pdf"


def test_compute_facets():
    payloads = [
        {"metadata": {"doc_id": 1, "doc_name": "a.pdf", "tags": ["x"], "source_type": "pdf"}},
        {"metadata": {"doc_id": 1, "doc_name": "a.pdf", "tags": ["x"], "source_type": "pdf"}},
    ]
    facets = compute_facets(payloads)
    assert len(facets["documents"]) == 1
    assert facets["tags"][0]["value"] == "x"
