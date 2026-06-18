import os
import shutil
import time
import logging
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import psutil

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from lib import db, providers, rag

# Configure Logging
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ragbuilder.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("ragbuilder")

app = FastAPI(title="RAGBuilder Framework", description="Build custom local RAG bots")
START_TIME = time.time()

# Enable CORS for easy API usage
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create temp upload directory
TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# Pydantic schemas
class BotCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    provider: str # "ollama" or "lm_studio"
    api_url: str
    llm_model: str
    embedding_model: str
    search_technique: str = "vector" # "vector", "keyword", "hybrid"
    chunk_size: int = 500
    chunk_overlap: int = 50
    system_prompt: Optional[str] = "You are a helpful assistant."
    temperature: float = 0.2

class BotUpdate(BaseModel):
    name: str
    description: Optional[str] = ""
    provider: str
    api_url: str
    llm_model: str
    embedding_model: str
    search_technique: str
    chunk_size: int
    chunk_overlap: int
    system_prompt: Optional[str]
    temperature: float

class TestProviderRequest(BaseModel):
    provider: str
    api_url: str

class QueryRequest(BaseModel):
    query: str
    session_id: Optional[int] = None

# Helper to get folder size
def get_folder_size_kb(folder_path: str) -> float:
    if not os.path.exists(folder_path):
        return 0.0
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(folder_path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.exists(fp):
                total_size += os.path.getsize(fp)
    return total_size / 1024.0

# UI route
@app.get("/", response_class=HTMLResponse)
async def read_index():
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read(), status_code=200)
    return HTMLResponse(content="<h1>RAGBuilder Frontend Not Found</h1><p>Please create static/index.html.</p>", status_code=404)

# System Status & Monitoring API Endpoints

@app.get("/api/system/stats")
async def get_system_stats():
    """Fetch real-time CPU, Memory, Disk, and Database statistics."""
    try:
        # Get memory metrics
        vm = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=None)
        
        # Get DB sizes
        db_size_kb = 0.0
        if os.path.exists(db.DB_PATH):
            db_size_kb = os.path.getsize(db.DB_PATH) / 1024.0
            
        qdrant_size_kb = get_folder_size_kb(rag.QDRANT_PATH)
        
        # Get counts from DB
        conn = db.get_db_connection()
        cursor = conn.cursor()
        bots_count = cursor.execute("SELECT COUNT(*) FROM bots").fetchone()[0]
        docs_count = cursor.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        sessions_count = cursor.execute("SELECT COUNT(*) FROM chat_sessions").fetchone()[0]
        conn.close()
        
        # Disk stats
        disk = psutil.disk_usage('/')
        
        # Process specific metrics
        process = psutil.Process(os.getpid())
        uptime = time.time() - START_TIME
        rss_mb = process.memory_info().rss / (1024 * 1024)
        mem_percent = process.memory_percent()
        threads_count = process.num_threads()
        try:
            open_fds = process.num_fds()
        except AttributeError:
            open_fds = len(process.open_files())
        connections_count = len(process.connections())
        vms_mb = process.memory_info().vms / (1024 * 1024)
        
        return {
            "cpu_percent": cpu_percent,
            "ram_percent": vm.percent,
            "ram_total_mb": vm.total / (1024 * 1024),
            "ram_used_mb": vm.used / (1024 * 1024),
            "disk_percent": disk.percent,
            "db_size_kb": db_size_kb,
            "qdrant_size_kb": qdrant_size_kb,
            "bots_count": bots_count,
            "docs_count": docs_count,
            "sessions_count": sessions_count,
            
            # Process metrics
            "process_rss_mb": rss_mb,
            "process_mem_percent": mem_percent,
            "process_uptime_seconds": uptime,
            "process_threads": threads_count,
            "process_fds": open_fds,
            "process_connections": connections_count,
            "process_vms_mb": vms_mb,
            "pid": os.getpid()
        }
    except Exception as e:
        logger.error(f"Error fetching system stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {e}")

@app.get("/api/system/logs")
async def get_system_logs(lines: int = 80, level: Optional[str] = None):
    """Retrieve the tail of the log file, optionally filtered by level."""
    if not os.path.exists(LOG_FILE):
        return []
        
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
            
        # Filter logs
        filtered = []
        for line in reversed(all_lines):
            if len(filtered) >= lines:
                break
            # Optional filter by level, e.g. "[INFO]" or "[ERROR]"
            if level:
                if f"[{level.upper()}]" in line:
                    filtered.append(line.strip())
            else:
                filtered.append(line.strip())
                
        # Re-reverse to put in chronological order
        return list(reversed(filtered))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read logs: {e}")

@app.post("/api/system/logs/clear")
async def clear_system_logs():
    """Truncate the log file to clear it."""
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.write("")
        return {"status": "success", "message": "Log file cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing logs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear logs: {e}")

# API Routes for Providers and Bots

@app.post("/api/providers/test")
async def test_provider(req: TestProviderRequest):
    """Test connection and return available models for a provider."""
    provider = req.provider.lower()
    api_url = req.api_url
    logger.info(f"Testing provider connection: {provider} at {api_url}")
    
    if provider == "ollama":
        models = providers.get_ollama_models(api_url)
        if models:
            logger.info(f"Ollama connection successful: found {len(models)} models")
            return {"success": True, "models": models}
        return {"success": False, "message": "Failed to connect or fetch models from Ollama. Make sure it is running."}
    elif provider == "lm_studio":
        models = providers.get_lm_studio_models(api_url)
        if models:
            logger.info(f"LM Studio connection successful: found {len(models)} models")
            return {"success": True, "models": models}
        return {"success": False, "message": "Failed to connect or fetch models from LM Studio. Make sure it is running and Local Server is enabled."}
    
    raise HTTPException(status_code=400, detail="Invalid provider specified")

@app.get("/api/bots")
async def list_bots():
    return db.get_bots()

@app.post("/api/bots")
async def create_new_bot(bot: BotCreate):
    logger.info(f"Creating new bot: {bot.name} with provider {bot.provider}")
    bot_id = db.create_bot(
        name=bot.name,
        description=bot.description,
        provider=bot.provider,
        api_url=bot.api_url,
        llm_model=bot.llm_model,
        embedding_model=bot.embedding_model,
        search_technique=bot.search_technique,
        chunk_size=bot.chunk_size,
        chunk_overlap=bot.chunk_overlap,
        system_prompt=bot.system_prompt,
        temperature=bot.temperature
    )
    if bot_id is None:
        logger.warning(f"Bot creation failed: Name '{bot.name}' is already taken.")
        raise HTTPException(status_code=400, detail="Bot name must be unique")
    logger.info(f"Bot '{bot.name}' created successfully with ID: {bot_id}")
    return {"id": bot_id, "message": "Bot created successfully"}

@app.get("/api/bots/{bot_id}")
async def get_bot_details(bot_id: int):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot

@app.put("/api/bots/{bot_id}")
async def update_bot_details(bot_id: int, bot: BotUpdate):
    exists = db.get_bot(bot_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Bot not found")
    logger.info(f"Updating configuration for bot ID: {bot_id}")
    db.update_bot(
        bot_id=bot_id,
        name=bot.name,
        description=bot.description,
        provider=bot.provider,
        api_url=bot.api_url,
        llm_model=bot.llm_model,
        embedding_model=bot.embedding_model,
        search_technique=bot.search_technique,
        chunk_size=bot.chunk_size,
        chunk_overlap=bot.chunk_overlap,
        system_prompt=bot.system_prompt,
        temperature=bot.temperature
    )
    return {"success": True, "message": "Bot updated successfully"}

@app.delete("/api/bots/{bot_id}")
async def delete_bot_instance(bot_id: int):
    bot = db.get_bot(bot_id)
    bot_name = bot["name"] if bot else f"ID {bot_id}"
    logger.info(f"Deleting bot: {bot_name}")
    rag.delete_bot_collection(bot_id)
    db.delete_bot(bot_id)
    logger.info(f"Deleted bot {bot_name} successfully.")
    return {"success": True, "message": "Bot deleted successfully"}

# Document management

@app.get("/api/bots/{bot_id}/documents")
async def list_bot_documents(bot_id: int):
    return db.get_documents_by_bot(bot_id)

@app.post("/api/bots/{bot_id}/documents")
async def upload_document(
    bot_id: int,
    file: UploadFile = File(...)
):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    start_time = time.time()
    logger.info(f"Ingesting file: {file.filename} for bot '{bot['name']}'")
    
    # Write uploaded file to temp directory to parse
    temp_filepath = os.path.join(TEMP_DIR, file.filename)
    try:
        with open(temp_filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Parse document based on extension
        parse_start = time.time()
        content = rag.parse_file(temp_filepath, file.filename)
        logger.info(f"Parsed {file.filename} successfully in {((time.time() - parse_start)*1000):.1f}ms")
    except Exception as e:
        logger.error(f"Error parsing file {file.filename}: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to read or parse file: {e}")
    finally:
        # Cleanup temp file
        if os.path.exists(temp_filepath):
            os.remove(temp_filepath)
            
    if not content.strip():
        logger.warning(f"Aborted ingestion: parsed text content of {file.filename} is empty.")
        raise HTTPException(status_code=400, detail="Parsed file content is empty")
        
    # Save document metadata in SQLite
    doc_id = db.add_document(bot_id, file.filename, content)
    
    # Initialize LangChain Embeddings model
    try:
        embeddings_model = providers.get_embeddings_model(
            provider=bot["provider"],
            api_url=bot["api_url"],
            model=bot["embedding_model"]
        )
    except Exception as e:
        db.delete_document(doc_id)
        logger.error(f"Failed to initialize embeddings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize embedding model: {e}")
        
    if not embeddings_model:
        db.delete_document(doc_id)
        raise HTTPException(status_code=400, detail="Embedding model not configured for this bot")

    # Index chunks in Qdrant
    try:
        index_start = time.time()
        chunks_count = rag.index_document(
            bot_id=bot_id,
            doc_id=doc_id,
            text=content,
            name=file.filename,
            embeddings_model=embeddings_model
        )
        total_time_ms = (time.time() - start_time) * 1000
        logger.info(f"Indexed {chunks_count} chunks for {file.filename} in Qdrant in {((time.time() - index_start)*1000):.1f}ms (Total elapsed: {total_time_ms:.1f}ms)")
    except Exception as e:
        db.delete_document(doc_id)
        logger.error(f"Error writing chunks to Qdrant: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to index document in Qdrant: {e}")
        
    return {"doc_id": doc_id, "chunks_count": chunks_count, "message": "Document uploaded and indexed successfully"}

@app.delete("/api/bots/{bot_id}/documents/{doc_id}")
async def delete_bot_document(bot_id: int, doc_id: int):
    docs = db.get_documents_by_bot(bot_id)
    doc_obj = next((d for d in docs if d["id"] == doc_id), None)
    if not doc_obj:
        raise HTTPException(status_code=404, detail="Document not found for this bot")
        
    doc_name = doc_obj["name"]
    logger.info(f"Deleting document '{doc_name}' (ID: {doc_id})")
    rag.delete_document_chunks(bot_id, doc_id)
    db.delete_document(doc_id)
    logger.info(f"Deleted document '{doc_name}' reference and segments successfully.")
    return {"success": True, "message": "Document deleted successfully"}


# Chat Session Management API Endpoints

@app.get("/api/bots/{bot_id}/sessions")
async def list_bot_sessions(bot_id: int):
    return db.get_chat_sessions(bot_id)

@app.post("/api/bots/{bot_id}/sessions")
async def create_bot_session(bot_id: int, name: Optional[str] = "New Chat"):
    session_id = db.create_chat_session(bot_id, name)
    logger.info(f"Created new chat session ID: {session_id} for bot ID: {bot_id}")
    return {"session_id": session_id, "name": name}

@app.delete("/api/bots/{bot_id}/sessions/{session_id}")
async def delete_bot_session(bot_id: int, session_id: int):
    db.delete_chat_session(session_id)
    return {"success": True}

@app.get("/api/bots/{bot_id}/sessions/{session_id}/messages")
async def get_session_messages(bot_id: int, session_id: int):
    return db.get_chat_messages(session_id)


# RAG query and streaming chat endpoints

@app.post("/api/bots/{bot_id}/chat")
async def chat_with_bot_stream(bot_id: int, req: QueryRequest):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    query = req.query
    session_id = req.session_id
    
    start_time = time.time()
    logger.info(f"Query request received for bot '{bot['name']}': '{query}'")
    
    if not session_id:
        session_id = db.create_chat_session(bot_id, f"Chat - {query[:20]}")
        
    db.add_chat_message(session_id, "user", query)
    
    # Load Embeddings
    try:
        embeddings_model = providers.get_embeddings_model(
            provider=bot["provider"],
            api_url=bot["api_url"],
            model=bot["embedding_model"]
        )
    except Exception as e:
        logger.error(f"Embedding initialization error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load embedding model: {e}")
        
    # Retrieve relevant context from Qdrant
    try:
        retrieval_start = time.time()
        retrieved = rag.retrieve_context(
            bot_id=bot_id,
            query=query,
            embeddings_model=embeddings_model,
            technique=bot["search_technique"],
            top_k=4
        )
        retrieval_latency = (time.time() - retrieval_start) * 1000
        logger.info(f"Retrieved {len(retrieved)} context segments in {retrieval_latency:.1f}ms using {bot['search_technique']} strategy")
    except Exception as e:
        logger.error(f"Context retrieval error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve context from Qdrant: {e}")
        
    context_text = "\n\n---\n\n".join([c["content"] for c in retrieved])
    
    # Load LLM
    try:
        llm_model = providers.get_llm_model(
            provider=bot["provider"],
            api_url=bot["api_url"],
            model=bot["llm_model"],
            temperature=bot.get("temperature", 0.2)
        )
    except Exception as e:
        logger.error(f"LLM model initialization error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load LLM model: {e}")

    # Build conversation history
    history_messages = db.get_chat_messages(session_id)
    messages_payload = []
    for msg in history_messages[:-1]:
        if msg["sender"] == "user":
            messages_payload.append(HumanMessage(content=msg["text"]))
        else:
            messages_payload.append(AIMessage(content=msg["text"]))
            
    system_prompt = bot["system_prompt"] or "You are a helpful assistant."
    
    async def sse_generator():
        metadata_payload = {
            "session_id": session_id,
            "context": retrieved
        }
        yield f"event: metadata\ndata: {json.dumps(metadata_payload)}\n\n"
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="history"),
            ("user", "Use the following context to answer the user query.\n\nContext:\n{context}\n\nUser Query: {query}")
        ])
        
        chain = prompt | llm_model | StrOutputParser()
        
        full_response = ""
        gen_start = time.time()
        try:
            async for chunk in chain.astream({
                "history": messages_payload,
                "context": context_text or "No context retrieved from documents.",
                "query": query
            }):
                full_response += chunk
                yield f"event: token\ndata: {json.dumps(chunk)}\n\n"
                
            generation_latency = (time.time() - gen_start) * 1000
            total_latency = (time.time() - start_time) * 1000
            db.add_chat_message(session_id, "bot", full_response)
            logger.info(f"Generated RAG response in {generation_latency:.1f}ms. Total query resolution: {total_latency:.1f}ms.")
            yield "event: end\ndata: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Error during LLM token streaming: {e}")
            error_msg = f"LLM Streaming Execution Error: {e}"
            yield f"event: error\ndata: {json.dumps(error_msg)}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

# Public external API endpoint (non-streaming, simple JSON payload)
@app.post("/api/bots/{bot_id}/query")
async def public_bot_query(bot_id: int, req: QueryRequest):
    """Public query endpoint for API integration."""
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    query = req.query
    start_time = time.time()
    logger.info(f"Public API query received for bot '{bot['name']}': '{query}'")
    
    try:
        embeddings_model = providers.get_embeddings_model(
            provider=bot["provider"],
            api_url=bot["api_url"],
            model=bot["embedding_model"]
        )
        llm_model = providers.get_llm_model(
            provider=bot["provider"],
            api_url=bot["api_url"],
            model=bot["llm_model"],
            temperature=bot.get("temperature", 0.2)
        )
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load models: {e}")
        
    try:
        retrieved = rag.retrieve_context(
            bot_id=bot_id,
            query=query,
            embeddings_model=embeddings_model,
            technique=bot["search_technique"],
            top_k=4
        )
    except Exception as e:
        logger.error(f"Retrieval error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve context: {e}")
        
    context = "\n\n---\n\n".join([c["content"] for c in retrieved])
    
    try:
        prompt = ChatPromptTemplate.from_messages([
            ("system", bot["system_prompt"] or "You are a helpful assistant."),
            ("user", "Use the following context to answer the user query.\n\nContext:\n{context}\n\nUser Query: {query}")
        ])
        
        chain = prompt | llm_model | StrOutputParser()
        
        response = chain.invoke({
            "context": context or "No context retrieved from documents.",
            "query": query
        })
        logger.info(f"Public query processed successfully in {((time.time() - start_time)*1000):.1f}ms.")
    except Exception as e:
        logger.error(f"LLM generation error: {e}")
        raise HTTPException(status_code=500, detail=f"LLM Generation Error: {e}")
        
    return {
        "bot": bot["name"],
        "query": query,
        "response": response,
        "sources": [c["content"] for c in retrieved]
    }
