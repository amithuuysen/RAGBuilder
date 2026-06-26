from lib.rag import chunk_document, _source_type_from_filename


def test_source_type_from_filename():
    assert _source_type_from_filename("report.PDF") == "pdf"
    assert _source_type_from_filename("notes.md") == "md"


def test_chunk_document_respects_size():
    text = "word " * 200
    docs = chunk_document(text, chunk_size=100, chunk_overlap=10)
    assert len(docs) > 1
    for doc in docs:
        assert len(doc.page_content) <= 120


def test_chunk_document_with_segments():
    segments = [
        {"text": "Section A content here.", "page_number": 1, "section_heading": "A"},
        {"text": "Section B content here.", "page_number": 2, "section_heading": "B"},
    ]
    docs = chunk_document("ignored", chunk_size=500, chunk_overlap=0, segments=segments)
    assert len(docs) >= 2
    assert docs[0].metadata.get("page_number") == 1
