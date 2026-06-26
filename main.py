import json
import logging
import os
import re
import shutil
import time
import uuid
from typing import Any, Dict, List, Optional

import psutil
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, ConfigDict, Field

from lib import db, providers, rag
from lib.config import (
    ALLOWED_EXTENSIONS,
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    DEFAULT_KEYWORD_WEIGHT,
    DEFAULT_TOP_K,
    DEFAULT_VECTOR_WEIGHT,
    LOG_FILE,
    MAX_QUERY_LENGTH,
    MAX_UPLOAD_BYTES,
    TEMP_DIR,
)
from lib.metadata import merge_filters

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("ragbuilder")

app = FastAPI(title="RAGBuilder Framework", description="Build custom local RAG bots")
START_TIME = time.time()
os.makedirs(TEMP_DIR, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TagFilter(BaseModel):
    values: List[str] = []
    mode: str = "any"


class DateRangeFilter(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_: Optional[str] = Field(None, alias="from")
    to: Optional[str] = None


class PageRangeFilter(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_: Optional[int] = Field(None, alias="from")
    to: Optional[int] = None


class RetrievalFilters(BaseModel):
    doc_ids: Optional[List[int]] = None
    exclude_doc_ids: Optional[List[int]] = None
    source_type: Optional[str] = None
    author: Optional[str] = None
    tags: Optional[TagFilter] = None
    date_range: Optional[DateRangeFilter] = None
    page_range: Optional[PageRangeFilter] = None
    custom: Optional[Dict[str, Any]] = None


class BotCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    provider: str
    api_url: str
    llm_model: str
    embedding_model: str
    search_technique: str = "vector"
    chunk_size: int = DEFAULT_CHUNK_SIZE
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP
    system_prompt: Optional[str] = "You are a helpful assistant."
    temperature: float = 0.2
    top_k: int = DEFAULT_TOP_K
    vector_weight: float = DEFAULT_VECTOR_WEIGHT
    keyword_weight: float = DEFAULT_KEYWORD_WEIGHT
    score_threshold: float = 0.0
    use_mmr: bool = False
    default_filters: Optional[Dict[str, Any]] = None
    cite_sources: bool = True


class BotUpdate(BotCreate):
    pass


class TestProviderRequest(BaseModel):
    provider: str
    api_url: str


class QueryRequest(BaseModel):
    query: str
    session_id: Optional[int] = None
    top_k: Optional[int] = None
    filters: Optional[RetrievalFilters] = None


class RetrieveRequest(BaseModel):
    query: str
    top_k: Optional[int] = None
    filters: Optional[RetrievalFilters] = None


class DocumentMetadataUpdate(BaseModel):
    tags: Optional[List[str]] = None
    source_url: Optional[str] = None
    author: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class BulkDocumentMetadataUpdate(BaseModel):
    doc_ids: List[int]
    tags: Optional[List[str]] = None
    add_tags: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_folder_size_kb(folder_path: str) -> float:
    if not os.path.exists(folder_path):
        return 0.0
    total_size = 0
    for dirpath, _, filenames in os.walk(folder_path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.exists(fp):
                total_size += os.path.getsize(fp)
    return total_size / 1024.0


def _safe_filename(filename: str) -> str:
    name = os.path.basename(filename or "upload")
    name = re.sub(r"[^\w.\- ]", "_", name)
    return name or f"upload_{uuid.uuid4().hex[:8]}"


def _filters_to_dict(filters: Optional[RetrievalFilters]) -> Optional[Dict[str, Any]]:
    if not filters:
        return None
    data = filters.model_dump(by_alias=True, exclude_none=True)
    if "date_range" in data and data["date_range"]:
        dr = data["date_range"]
        data["date_range"] = {k: v for k, v in dr.items() if v is not None}
    if "page_range" in data and data["page_range"]:
        pr = data["page_range"]
        data["page_range"] = {k: v for k, v in pr.items() if v is not None}
    return data


def _build_citation_instruction(cite_sources: bool) -> str:
    if not cite_sources:
        return ""
    return (
        " When using retrieved context, cite sources inline as [doc_name, chunk #N] "
        "or [doc_name, p.PAGE] when page numbers are available."
    )


def _format_context_with_citations(chunks: List[Dict[str, Any]]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, start=1):
        meta = chunk.get("metadata") or {}
        label = meta.get("doc_name", "unknown")
        if meta.get("page_number"):
            label += f", p.{meta['page_number']}"
        elif meta.get("chunk_index") is not None:
            label += f", chunk #{meta['chunk_index']}"
        parts.append(f"[Source {i}: {label}]\n{chunk['content']}")
    return "\n\n---\n\n".join(parts)


def _get_retrieval_params(bot: Dict[str, Any], req_top_k: Optional[int] = None):
    return {
        "top_k": req_top_k or bot.get("top_k", DEFAULT_TOP_K),
        "vector_weight": bot.get("vector_weight", DEFAULT_VECTOR_WEIGHT),
        "keyword_weight": bot.get("keyword_weight", DEFAULT_KEYWORD_WEIGHT),
        "score_threshold": bot.get("score_threshold", 0.0),
        "use_mmr": bool(bot.get("use_mmr", False)),
    }


def _verify_session_belongs_to_bot(session_id: int, bot_id: int):
    session = db.get_chat_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["bot_id"] != bot_id:
        raise HTTPException(status_code=403, detail="Session does not belong to this bot")


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def read_index():
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read(), status_code=200)
    return HTMLResponse(
        content="<h1>RAGBuilder Frontend Not Found</h1><p>Use the Next.js UI at http://localhost:3000</p>",
        status_code=404,
    )


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

@app.get("/api/system/stats")
async def get_system_stats():
    try:
        vm = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=None)
        from lib.config import DB_PATH
        db_size_kb = os.path.getsize(DB_PATH) / 1024.0 if os.path.exists(DB_PATH) else 0.0
        qdrant_size_kb = get_folder_size_kb(rag.QDRANT_PATH)

        conn = db.get_db_connection()
        cursor = conn.cursor()
        bots_count = cursor.execute("SELECT COUNT(*) FROM bots").fetchone()[0]
        docs_count = cursor.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        sessions_count = cursor.execute("SELECT COUNT(*) FROM chat_sessions").fetchone()[0]
        conn.close()

        disk = psutil.disk_usage("/")
        process = psutil.Process(os.getpid())
        uptime = time.time() - START_TIME
        rss_mb = process.memory_info().rss / (1024 * 1024)

        try:
            open_fds = process.num_fds()
        except AttributeError:
            open_fds = len(process.open_files())

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
            "process_rss_mb": rss_mb,
            "process_mem_percent": process.memory_percent(),
            "process_uptime_seconds": uptime,
            "process_threads": process.num_threads(),
            "process_fds": open_fds,
            "process_connections": len(process.connections()),
            "process_vms_mb": process.memory_info().vms / (1024 * 1024),
            "pid": os.getpid(),
        }
    except Exception as e:
        logger.error("Error fetching system stats: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {e}") from e


@app.get("/api/system/logs")
async def get_system_logs(lines: int = 80, level: Optional[str] = None):
    if not os.path.exists(LOG_FILE):
        return []
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
        filtered = []
        for line in reversed(all_lines):
            if len(filtered) >= lines:
                break
            if level:
                if f"[{level.upper()}]" in line:
                    filtered.append(line.strip())
            else:
                filtered.append(line.strip())
        return list(reversed(filtered))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read logs: {e}") from e


@app.post("/api/system/logs/clear")
async def clear_system_logs():
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.write("")
        return {"status": "success", "message": "Log file cleared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear logs: {e}") from e


# ---------------------------------------------------------------------------
# Providers & Bots
# ---------------------------------------------------------------------------

@app.post("/api/providers/test")
async def test_provider(req: TestProviderRequest):
    provider = req.provider.lower()
    api_url = req.api_url
    if provider == "ollama":
        models = providers.get_ollama_models(api_url)
    elif provider == "lm_studio":
        models = providers.get_lm_studio_models(api_url)
    elif provider == "vllm":
        models = providers.get_vllm_models(api_url)
    else:
        raise HTTPException(status_code=400, detail="Invalid provider specified")

    if models:
        return {"success": True, "models": models}
    return {"success": False, "message": f"Failed to connect to {provider}. Make sure it is running."}


@app.get("/api/bots")
async def list_bots():
    return db.get_bots()


@app.post("/api/bots")
async def create_new_bot(bot: BotCreate):
    bot_id = db.create_bot(**bot.model_dump())
    if bot_id is None:
        raise HTTPException(status_code=400, detail="Bot name must be unique")
    return {"id": bot_id, "message": "Bot created successfully"}


@app.get("/api/bots/{bot_id}")
async def get_bot_details(bot_id: int):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot


@app.put("/api/bots/{bot_id}")
async def update_bot_details(bot_id: int, bot: BotUpdate):
    if not db.get_bot(bot_id):
        raise HTTPException(status_code=404, detail="Bot not found")
    db.update_bot(bot_id=bot_id, **bot.model_dump())
    return {"success": True, "message": "Bot updated successfully"}


@app.delete("/api/bots/{bot_id}")
async def delete_bot_instance(bot_id: int):
    rag.delete_bot_collection(bot_id)
    db.delete_bot(bot_id)
    return {"success": True, "message": "Bot deleted successfully"}


@app.get("/api/bots/{bot_id}/export")
async def export_bot(bot_id: int):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    documents = db.get_documents_by_bot(bot_id, include_content=False)
    stats = rag.get_collection_stats(bot_id)
    return {
        "bot": bot,
        "documents": documents,
        "index_stats": stats,
    }


@app.post("/api/bots/{bot_id}/reindex")
async def reindex_bot(bot_id: int):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    documents = db.get_documents_by_bot(bot_id, include_content=True)
    if not documents:
        return {"message": "No documents to reindex", "documents_reindexed": 0, "total_chunks": 0}

    try:
        embeddings_model = providers.get_embeddings_model(
            provider=bot["provider"],
            api_url=bot["api_url"],
            model=bot["embedding_model"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load embedding model: {e}") from e

    result = rag.reindex_all_documents(
        bot_id=bot_id,
        documents=documents,
        embeddings_model=embeddings_model,
        chunk_size=bot["chunk_size"],
        chunk_overlap=bot["chunk_overlap"],
    )

    for doc_id, count in result.get("chunks_per_document", {}).items():
        db.update_document_chunks_count(doc_id, count)

    return {"message": "Reindex complete", **result}


@app.get("/api/bots/{bot_id}/index/stats")
async def get_index_stats(bot_id: int):
    if not db.get_bot(bot_id):
        raise HTTPException(status_code=404, detail="Bot not found")
    return rag.get_collection_stats(bot_id)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

@app.get("/api/bots/{bot_id}/documents")
async def list_bot_documents(bot_id: int, include_content: bool = False):
    if not db.get_bot(bot_id):
        raise HTTPException(status_code=404, detail="Bot not found")
    documents = db.get_documents_by_bot(bot_id, include_content=include_content)
    chunk_counts = rag.get_chunk_counts_by_bot(bot_id)
    for doc in documents:
        count = chunk_counts.get(doc["id"], 0)
        if doc.get("chunks_count") != count:
            db.update_document_chunks_count(doc["id"], count)
        doc["chunks_count"] = count
    return documents


@app.post("/api/bots/{bot_id}/documents")
async def upload_document(
    bot_id: int,
    file: UploadFile = File(...),
    tags: Optional[str] = Form(None),
    source_url: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    safe_name = _safe_filename(file.filename or "upload")
    ext = os.path.splitext(safe_name.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    temp_filepath = os.path.join(TEMP_DIR, f"{uuid.uuid4().hex}_{safe_name}")
    try:
        size = 0
        with open(temp_filepath, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds maximum upload size")
                buffer.write(chunk)

        content, segments = rag.parse_file(temp_filepath, safe_name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read or parse file: {e}") from e
    finally:
        if os.path.exists(temp_filepath):
            os.remove(temp_filepath)

    if not content.strip():
        raise HTTPException(status_code=400, detail="Parsed file content is empty")

    parsed_tags = json.loads(tags) if tags and tags.startswith("[") else (
        [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    )
    source_type = rag._source_type_from_filename(safe_name)

    doc_id = db.add_document(
        bot_id=bot_id,
        name=safe_name,
        content=content,
        source_type=source_type,
        source_url=source_url or "",
        tags=parsed_tags,
        author=author or "",
        metadata={"custom_fields": {}},
    )

    try:
        embeddings_model = providers.get_embeddings_model(
            provider=bot["provider"],
            api_url=bot["api_url"],
            model=bot["embedding_model"],
        )
    except Exception as e:
        db.delete_document(doc_id)
        raise HTTPException(status_code=500, detail=f"Failed to initialize embedding model: {e}") from e

    if not embeddings_model:
        db.delete_document(doc_id)
        raise HTTPException(status_code=400, detail="Embedding model not configured for this bot")

    doc_meta = {
        "source_type": source_type,
        "tags": parsed_tags,
        "source_url": source_url or "",
        "author": author or "",
        "uploaded_at": db.get_document(doc_id, include_content=False)["uploaded_at"],
        "custom_fields": {},
    }

    try:
        chunks_count = rag.index_document(
            bot_id=bot_id,
            doc_id=doc_id,
            text=content,
            name=safe_name,
            embeddings_model=embeddings_model,
            chunk_size=bot["chunk_size"],
            chunk_overlap=bot["chunk_overlap"],
            doc_metadata=doc_meta,
            segments=segments,
        )
        db.update_document_chunks_count(doc_id, chunks_count)
    except Exception as e:
        db.delete_document(doc_id)
        raise HTTPException(status_code=500, detail=f"Failed to index document: {e}") from e

    return {
        "doc_id": doc_id,
        "chunks_count": chunks_count,
        "message": "Document uploaded and indexed successfully",
    }


@app.post("/api/bots/{bot_id}/documents/bulk")
async def upload_documents_bulk(
    bot_id: int,
    files: List[UploadFile] = File(...),
    tags: Optional[str] = Form(None),
):
    results = []
    for file in files:
        try:
            result = await upload_document(bot_id=bot_id, file=file, tags=tags)
            results.append({"filename": file.filename, "success": True, **result})
        except HTTPException as e:
            results.append({"filename": file.filename, "success": False, "error": e.detail})
    return {"results": results}


@app.patch("/api/bots/{bot_id}/documents/{doc_id}/metadata")
async def update_document_metadata(bot_id: int, doc_id: int, payload: DocumentMetadataUpdate):
    doc = db.get_document(doc_id, include_content=False)
    if not doc or doc["bot_id"] != bot_id:
        raise HTTPException(status_code=404, detail="Document not found for this bot")

    db.update_document_metadata(
        doc_id=doc_id,
        tags=payload.tags,
        source_url=payload.source_url,
        author=payload.author,
        metadata=payload.metadata,
    )
    return {"success": True, "message": "Metadata updated. Reindex to apply tag filters to existing chunks."}


@app.post("/api/bots/{bot_id}/documents/bulk-metadata")
async def bulk_update_document_metadata(bot_id: int, payload: BulkDocumentMetadataUpdate):
    updated = 0
    for doc_id in payload.doc_ids:
        doc = db.get_document(doc_id, include_content=False)
        if not doc or doc["bot_id"] != bot_id:
            continue
        new_tags = list(doc.get("tags") or [])
        if payload.tags is not None:
            new_tags = payload.tags
        if payload.add_tags:
            for tag in payload.add_tags:
                if tag not in new_tags:
                    new_tags.append(tag)
        db.update_document_metadata(doc_id=doc_id, tags=new_tags)
        updated += 1
    return {"success": True, "updated": updated}


@app.delete("/api/bots/{bot_id}/documents/{doc_id}")
async def delete_bot_document(bot_id: int, doc_id: int):
    doc = db.get_document(doc_id, include_content=False)
    if not doc or doc["bot_id"] != bot_id:
        raise HTTPException(status_code=404, detail="Document not found for this bot")
    rag.delete_document_chunks(bot_id, doc_id)
    db.delete_document(doc_id)
    return {"success": True, "message": "Document deleted successfully"}


# ---------------------------------------------------------------------------
# Metadata facets
# ---------------------------------------------------------------------------

@app.get("/api/bots/{bot_id}/metadata/facets")
async def get_metadata_facets(bot_id: int):
    if not db.get_bot(bot_id):
        raise HTTPException(status_code=404, detail="Bot not found")
    return rag.get_collection_facets(bot_id)


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@app.get("/api/bots/{bot_id}/sessions")
async def list_bot_sessions(bot_id: int):
    if not db.get_bot(bot_id):
        raise HTTPException(status_code=404, detail="Bot not found")
    return db.get_chat_sessions(bot_id)


@app.post("/api/bots/{bot_id}/sessions")
async def create_bot_session(bot_id: int, name: Optional[str] = "New Chat"):
    if not db.get_bot(bot_id):
        raise HTTPException(status_code=404, detail="Bot not found")
    session_id = db.create_chat_session(bot_id, name)
    return {"session_id": session_id, "name": name}


@app.delete("/api/bots/{bot_id}/sessions/{session_id}")
async def delete_bot_session(bot_id: int, session_id: int):
    _verify_session_belongs_to_bot(session_id, bot_id)
    db.delete_chat_session(session_id)
    return {"success": True}


@app.get("/api/bots/{bot_id}/sessions/{session_id}/messages")
async def get_session_messages(bot_id: int, session_id: int):
    _verify_session_belongs_to_bot(session_id, bot_id)
    return db.get_chat_messages(session_id)


# ---------------------------------------------------------------------------
# Retrieval playground
# ---------------------------------------------------------------------------

@app.post("/api/bots/{bot_id}/retrieve")
async def retrieve_playground(bot_id: int, req: RetrieveRequest):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    if len(req.query) > MAX_QUERY_LENGTH:
        raise HTTPException(status_code=400, detail="Query exceeds maximum length")

    embeddings_model = providers.get_embeddings_model(
        provider=bot["provider"],
        api_url=bot["api_url"],
        model=bot["embedding_model"],
    )
    params = _get_retrieval_params(bot, req.top_k)
    merged = merge_filters(bot.get("default_filters"), _filters_to_dict(req.filters))

    chunks = rag.retrieve_context(
        bot_id=bot_id,
        query=req.query,
        embeddings_model=embeddings_model,
        technique=bot["search_technique"],
        filters=merged,
        **params,
    )
    return {"query": req.query, "filters": merged, "results": chunks, "count": len(chunks)}


# ---------------------------------------------------------------------------
# Chat & Query
# ---------------------------------------------------------------------------

@app.post("/api/bots/{bot_id}/chat")
async def chat_with_bot_stream(bot_id: int, req: QueryRequest):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    if len(req.query) > MAX_QUERY_LENGTH:
        raise HTTPException(status_code=400, detail="Query exceeds maximum length")

    query = req.query
    session_id = req.session_id

    if session_id:
        _verify_session_belongs_to_bot(session_id, bot_id)
    else:
        session_id = db.create_chat_session(bot_id, f"Chat - {query[:20]}")

    db.add_chat_message(session_id, "user", query)

    embeddings_model = providers.get_embeddings_model(
        provider=bot["provider"],
        api_url=bot["api_url"],
        model=bot["embedding_model"],
    )
    params = _get_retrieval_params(bot, req.top_k)
    merged = merge_filters(bot.get("default_filters"), _filters_to_dict(req.filters))

    retrieved = rag.retrieve_context(
        bot_id=bot_id,
        query=query,
        embeddings_model=embeddings_model,
        technique=bot["search_technique"],
        filters=merged,
        **params,
    )

    context_text = _format_context_with_citations(retrieved)
    llm_model = providers.get_llm_model(
        provider=bot["provider"],
        api_url=bot["api_url"],
        model=bot["llm_model"],
        temperature=bot.get("temperature", 0.2),
    )

    history_messages = db.get_chat_messages(session_id)
    messages_payload = []
    for msg in history_messages[:-1]:
        if msg["sender"] == "user":
            messages_payload.append(HumanMessage(content=msg["text"]))
        else:
            messages_payload.append(AIMessage(content=msg["text"]))

    cite = _build_citation_instruction(bool(bot.get("cite_sources", True)))
    system_prompt = (bot["system_prompt"] or "You are a helpful assistant.") + cite

    async def sse_generator():
        metadata_payload = {"session_id": session_id, "context": retrieved, "filters": merged}
        yield f"event: metadata\ndata: {json.dumps(metadata_payload)}\n\n"

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="history"),
            ("user", "Use the following context to answer the user query.\n\nContext:\n{context}\n\nUser Query: {query}"),
        ])
        chain = prompt | llm_model | StrOutputParser()
        full_response = ""
        try:
            async for chunk in chain.astream({
                "history": messages_payload,
                "context": context_text or "No context retrieved from documents.",
                "query": query,
            }):
                full_response += chunk
                yield f"event: token\ndata: {json.dumps(chunk)}\n\n"
            db.add_chat_message(session_id, "bot", full_response)
            yield "event: end\ndata: [DONE]\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps(str(e))}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@app.post("/api/bots/{bot_id}/query")
async def public_bot_query(bot_id: int, req: QueryRequest):
    bot = db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    if len(req.query) > MAX_QUERY_LENGTH:
        raise HTTPException(status_code=400, detail="Query exceeds maximum length")

    embeddings_model = providers.get_embeddings_model(
        provider=bot["provider"],
        api_url=bot["api_url"],
        model=bot["embedding_model"],
    )
    llm_model = providers.get_llm_model(
        provider=bot["provider"],
        api_url=bot["api_url"],
        model=bot["llm_model"],
        temperature=bot.get("temperature", 0.2),
    )
    params = _get_retrieval_params(bot, req.top_k)
    merged = merge_filters(bot.get("default_filters"), _filters_to_dict(req.filters))

    retrieved = rag.retrieve_context(
        bot_id=bot_id,
        query=req.query,
        embeddings_model=embeddings_model,
        technique=bot["search_technique"],
        filters=merged,
        **params,
    )

    context = _format_context_with_citations(retrieved)
    cite = _build_citation_instruction(bool(bot.get("cite_sources", True)))
    system_prompt = (bot["system_prompt"] or "You are a helpful assistant.") + cite

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("user", "Use the following context to answer the user query.\n\nContext:\n{context}\n\nUser Query: {query}"),
    ])
    chain = prompt | llm_model | StrOutputParser()
    response = chain.invoke({
        "context": context or "No context retrieved from documents.",
        "query": req.query,
    })

    return {
        "bot": bot["name"],
        "query": req.query,
        "response": response,
        "sources": retrieved,
        "filters": merged,
    }
