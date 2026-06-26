import sqlite3
import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from lib.config import DB_PATH, DEFAULT_TOP_K
from lib.metadata import parse_tags


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _add_column_if_missing(cursor, table: str, column: str, definition: str):
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except sqlite3.OperationalError:
        pass


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        provider TEXT NOT NULL,
        api_url TEXT NOT NULL,
        llm_model TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        search_technique TEXT NOT NULL,
        chunk_size INTEGER DEFAULT 500,
        chunk_overlap INTEGER DEFAULT 50,
        system_prompt TEXT,
        temperature REAL DEFAULT 0.2
    );
    """)

    _add_column_if_missing(cursor, "bots", "temperature", "REAL DEFAULT 0.2")
    _add_column_if_missing(cursor, "bots", "top_k", f"INTEGER DEFAULT {DEFAULT_TOP_K}")
    _add_column_if_missing(cursor, "bots", "vector_weight", "REAL DEFAULT 0.7")
    _add_column_if_missing(cursor, "bots", "keyword_weight", "REAL DEFAULT 0.3")
    _add_column_if_missing(cursor, "bots", "score_threshold", "REAL DEFAULT 0.0")
    _add_column_if_missing(cursor, "bots", "use_mmr", "INTEGER DEFAULT 0")
    _add_column_if_missing(cursor, "bots", "default_filters", "TEXT DEFAULT '{}'")
    _add_column_if_missing(cursor, "bots", "cite_sources", "INTEGER DEFAULT 1")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        FOREIGN KEY (bot_id) REFERENCES bots (id) ON DELETE CASCADE
    );
    """)

    _add_column_if_missing(cursor, "documents", "metadata_json", "TEXT DEFAULT '{}'")
    _add_column_if_missing(cursor, "documents", "source_type", "TEXT DEFAULT ''")
    _add_column_if_missing(cursor, "documents", "source_url", "TEXT DEFAULT ''")
    _add_column_if_missing(cursor, "documents", "tags", "TEXT DEFAULT '[]'")
    _add_column_if_missing(cursor, "documents", "author", "TEXT DEFAULT ''")
    _add_column_if_missing(cursor, "documents", "chunks_count", "INTEGER DEFAULT 0")
    _add_column_if_missing(cursor, "documents", "uploaded_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bots (id) ON DELETE CASCADE
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE
    );
    """)

    conn.commit()
    conn.close()


def _row_to_bot(row) -> Dict[str, Any]:
    bot = dict(row)
    bot["default_filters"] = json.loads(bot.get("default_filters") or "{}")
    bot["use_mmr"] = bool(bot.get("use_mmr", 0))
    bot["cite_sources"] = bool(bot.get("cite_sources", 1))
    return bot


def _row_to_document(row, include_content: bool = True) -> Dict[str, Any]:
    doc = dict(row)
    doc["tags"] = parse_tags(doc.get("tags"))
    doc["metadata"] = json.loads(doc.get("metadata_json") or "{}")
    if not include_content:
        doc.pop("content", None)
    return doc


def create_bot(
    name, description, provider, api_url, llm_model, embedding_model,
    search_technique, chunk_size, chunk_overlap, system_prompt,
    temperature=0.2, top_k=DEFAULT_TOP_K, vector_weight=0.7,
    keyword_weight=0.3, score_threshold=0.0, use_mmr=False,
    default_filters=None, cite_sources=True,
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO bots (
            name, description, provider, api_url, llm_model, embedding_model,
            search_technique, chunk_size, chunk_overlap, system_prompt, temperature,
            top_k, vector_weight, keyword_weight, score_threshold, use_mmr,
            default_filters, cite_sources
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            name, description, provider, api_url, llm_model, embedding_model,
            search_technique, chunk_size, chunk_overlap, system_prompt, temperature,
            top_k, vector_weight, keyword_weight, score_threshold,
            1 if use_mmr else 0, json.dumps(default_filters or {}),
            1 if cite_sources else 0,
        ))
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()


def get_bots():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bots")
    rows = cursor.fetchall()
    conn.close()
    return [_row_to_bot(row) for row in rows]


def get_bot(bot_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bots WHERE id = ?", (bot_id,))
    row = cursor.fetchone()
    conn.close()
    return _row_to_bot(row) if row else None


def update_bot(
    bot_id, name, description, provider, api_url, llm_model, embedding_model,
    search_technique, chunk_size, chunk_overlap, system_prompt, temperature=0.2,
    top_k=DEFAULT_TOP_K, vector_weight=0.7, keyword_weight=0.3,
    score_threshold=0.0, use_mmr=False, default_filters=None, cite_sources=True,
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE bots SET
        name = ?, description = ?, provider = ?, api_url = ?, llm_model = ?,
        embedding_model = ?, search_technique = ?, chunk_size = ?, chunk_overlap = ?,
        system_prompt = ?, temperature = ?, top_k = ?, vector_weight = ?,
        keyword_weight = ?, score_threshold = ?, use_mmr = ?,
        default_filters = ?, cite_sources = ?
    WHERE id = ?
    """, (
        name, description, provider, api_url, llm_model, embedding_model,
        search_technique, chunk_size, chunk_overlap, system_prompt, temperature,
        top_k, vector_weight, keyword_weight, score_threshold,
        1 if use_mmr else 0, json.dumps(default_filters or {}),
        1 if cite_sources else 0, bot_id,
    ))
    conn.commit()
    conn.close()
    return True


def delete_bot(bot_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.execute("DELETE FROM bots WHERE id = ?", (bot_id,))
    conn.commit()
    conn.close()
    return True


def add_document(
    bot_id, name, content, source_type="", source_url="", tags=None,
    author="", metadata=None, chunks_count=0,
):
    conn = get_db_connection()
    cursor = conn.cursor()
    tags_json = json.dumps(tags or [])
    metadata_json = json.dumps(metadata or {})
    cursor.execute("""
    INSERT INTO documents (
        bot_id, name, content, source_type, source_url, tags, author,
        metadata_json, chunks_count, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        bot_id, name, content, source_type, source_url, tags_json, author,
        metadata_json, chunks_count, datetime.utcnow().isoformat(),
    ))
    conn.commit()
    doc_id = cursor.lastrowid
    conn.close()
    return doc_id


def update_document_metadata(doc_id, tags=None, source_url=None, author=None, metadata=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    updates = {}
    if tags is not None:
        updates["tags"] = json.dumps(tags)
    if source_url is not None:
        updates["source_url"] = source_url
    if author is not None:
        updates["author"] = author
    if metadata is not None:
        updates["metadata_json"] = json.dumps(metadata)

    if not updates:
        conn.close()
        return True

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    cursor.execute(
        f"UPDATE documents SET {set_clause} WHERE id = ?",
        (*updates.values(), doc_id),
    )
    conn.commit()
    conn.close()
    return True


def update_document_chunks_count(doc_id, chunks_count):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE documents SET chunks_count = ? WHERE id = ?",
        (chunks_count, doc_id),
    )
    conn.commit()
    conn.close()


def get_documents_by_bot(bot_id, include_content=False):
    conn = get_db_connection()
    cursor = conn.cursor()
    if include_content:
        cursor.execute("SELECT * FROM documents WHERE bot_id = ? ORDER BY uploaded_at DESC", (bot_id,))
    else:
        cursor.execute("""
            SELECT id, bot_id, name, source_type, source_url, tags, author,
                   metadata_json, chunks_count, uploaded_at
            FROM documents WHERE bot_id = ? ORDER BY uploaded_at DESC
        """, (bot_id,))
    rows = cursor.fetchall()
    conn.close()
    return [_row_to_document(row, include_content=include_content) for row in rows]


def get_document(doc_id, include_content=True):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
    row = cursor.fetchone()
    conn.close()
    return _row_to_document(row, include_content=include_content) if row else None


def delete_document(doc_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    return True


def get_chat_session(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_chat_session(bot_id, name="New Chat"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO chat_sessions (bot_id, name) VALUES (?, ?)", (bot_id, name))
    conn.commit()
    session_id = cursor.lastrowid
    conn.close()
    return session_id


def get_chat_sessions(bot_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM chat_sessions WHERE bot_id = ? ORDER BY created_at DESC",
        (bot_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def delete_chat_session(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()
    return True


def add_chat_message(session_id, sender, text):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO chat_messages (session_id, sender, text) VALUES (?, ?, ?)",
        (session_id, sender, text),
    )
    conn.commit()
    msg_id = cursor.lastrowid
    conn.close()
    return msg_id


def get_chat_messages(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
        (session_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


init_db()
