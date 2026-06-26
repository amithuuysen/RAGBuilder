import os
import tempfile

import pytest
from fastapi.testclient import TestClient

# Use isolated DB for tests
_test_dir = tempfile.mkdtemp()
os.environ["RAGBUILDER_DB_PATH"] = os.path.join(_test_dir, "test.db")
os.environ["RAGBUILDER_QDRANT_PATH"] = os.path.join(_test_dir, "qdrant")
os.environ["RAGBUILDER_TEMP_DIR"] = os.path.join(_test_dir, "temp")

from lib import db  # noqa: E402
db.init_db()

from main import app  # noqa: E402

client = TestClient(app)


@pytest.fixture
def bot_id():
    bid = db.create_bot(
        name="test-bot",
        description="test",
        provider="ollama",
        api_url="http://127.0.0.1:11434",
        llm_model="llama3",
        embedding_model="nomic-embed-text",
        search_technique="vector",
        chunk_size=200,
        chunk_overlap=20,
        system_prompt="test",
    )
    assert bid is not None
    yield bid
    db.delete_bot(bid)


def test_list_bots_empty_initially():
    # May have bot from fixture runs; just check endpoint works
    res = client.get("/api/bots")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_create_and_get_bot(bot_id):
    res = client.get(f"/api/bots/{bot_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "test-bot"
    assert data["chunk_size"] == 200
    assert data["top_k"] == 4


def test_documents_list_excludes_content(bot_id):
    doc_id = db.add_document(bot_id, "test.txt", "hello world content", source_type="txt")
    res = client.get(f"/api/bots/{bot_id}/documents")
    assert res.status_code == 200
    docs = res.json()
    assert len(docs) >= 1
    assert "content" not in docs[0]
    db.delete_document(doc_id)


def test_session_ownership(bot_id):
    session_id = db.create_chat_session(bot_id, "Test")
    other_bot = db.create_bot(
        name="other-bot",
        description="",
        provider="ollama",
        api_url="http://127.0.0.1:11434",
        llm_model="llama3",
        embedding_model="nomic-embed-text",
        search_technique="vector",
        chunk_size=500,
        chunk_overlap=50,
        system_prompt="test",
    )
    res = client.get(f"/api/bots/{other_bot}/sessions/{session_id}/messages")
    assert res.status_code == 403
    db.delete_bot(other_bot)


def test_metadata_facets_empty(bot_id):
    res = client.get(f"/api/bots/{bot_id}/metadata/facets")
    assert res.status_code == 200
    data = res.json()
    assert "tags" in data
    assert "documents" in data


def test_export_bot(bot_id):
    res = client.get(f"/api/bots/{bot_id}/export")
    assert res.status_code == 200
    data = res.json()
    assert "bot" in data
    assert "documents" in data
