import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ragbuilder.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # Create bots table
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
        system_prompt TEXT
    );
    """)
    
    # Add temperature column to bots if it doesn't exist
    try:
        cursor.execute("ALTER TABLE bots ADD COLUMN temperature REAL DEFAULT 0.2;")
    except sqlite3.OperationalError:
        # Column already exists
        pass
    
    # Create documents table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        FOREIGN KEY (bot_id) REFERENCES bots (id) ON DELETE CASCADE
    );
    """)
    
    # Create chat_sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bots (id) ON DELETE CASCADE
    );
    """)
    
    # Create chat_messages table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        sender TEXT NOT NULL, -- 'user' or 'bot'
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE
    );
    """)
    
    conn.commit()
    conn.close()

# Bot Operations
def create_bot(name, description, provider, api_url, llm_model, embedding_model, search_technique, chunk_size, chunk_overlap, system_prompt, temperature=0.2):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO bots (name, description, provider, api_url, llm_model, embedding_model, search_technique, chunk_size, chunk_overlap, system_prompt, temperature)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, description, provider, api_url, llm_model, embedding_model, search_technique, chunk_size, chunk_overlap, system_prompt, temperature))
        conn.commit()
        bot_id = cursor.lastrowid
        return bot_id
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
    return [dict(row) for row in rows]

def get_bot(bot_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bots WHERE id = ?", (bot_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_bot(bot_id, name, description, provider, api_url, llm_model, embedding_model, search_technique, chunk_size, chunk_overlap, system_prompt, temperature=0.2):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE bots SET 
        name = ?, description = ?, provider = ?, api_url = ?, llm_model = ?, 
        embedding_model = ?, search_technique = ?, chunk_size = ?, chunk_overlap = ?, system_prompt = ?, temperature = ?
    WHERE id = ?
    """, (name, description, provider, api_url, llm_model, embedding_model, search_technique, chunk_size, chunk_overlap, system_prompt, temperature, bot_id))
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

# Document operations
def add_document(bot_id, name, content):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO documents (bot_id, name, content)
    VALUES (?, ?, ?)
    """, (bot_id, name, content))
    conn.commit()
    doc_id = cursor.lastrowid
    conn.close()
    return doc_id

def get_documents_by_bot(bot_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE bot_id = ?", (bot_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def delete_document(doc_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    return True

# Chat Sessions & Memory Operations
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
    cursor.execute("SELECT * FROM chat_sessions WHERE bot_id = ? ORDER BY created_at DESC", (bot_id,))
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
    cursor.execute("INSERT INTO chat_messages (session_id, sender, text) VALUES (?, ?, ?)", (session_id, sender, text))
    conn.commit()
    msg_id = cursor.lastrowid
    conn.close()
    return msg_id

def get_chat_messages(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

# Initialize DB on load
init_db()
