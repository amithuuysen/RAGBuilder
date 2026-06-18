import os
from typing import List, Dict, Any
import pypdf
import docx

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_qdrant import Qdrant
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models

QDRANT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "qdrant_db")

_client = None

def get_qdrant_client():
    global _client
    if _client is None:
        _client = QdrantClient(path=QDRANT_PATH)
    return _client

def parse_file(filepath: str, filename: str) -> str:
    """Extract text from PDF, DOCX, TXT, or MD files."""
    ext = os.path.splitext(filename.lower())[1]
    
    if ext == ".pdf":
        text = ""
        try:
            reader = pypdf.PdfReader(filepath)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        except Exception as e:
            raise ValueError(f"Failed to parse PDF file: {e}")
        return text
        
    elif ext in [".docx", ".doc"]:
        try:
            doc = docx.Document(filepath)
            return "\n".join([p.text for p in doc.paragraphs])
        except Exception as e:
            raise ValueError(f"Failed to parse DOCX file: {e}")
            
    else:
        # Fallback to plain text
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            raise ValueError(f"Failed to read text file: {e}")

def chunk_document(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[Document]:
    """Split text into chunks using LangChain's RecursiveCharacterTextSplitter."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    return splitter.create_documents([text])

def index_document(bot_id: int, doc_id: int, text: str, name: str, embeddings_model) -> int:
    """Chunk and index document metadata/text directly into the bot's Qdrant collection."""
    client = get_qdrant_client()
    collection_name = f"bot_{bot_id}"
    
    # 1. Chunk document
    docs = chunk_document(text)
    
    # Add metadata to each chunk
    for i, doc in enumerate(docs):
        doc.metadata = {
            "doc_id": doc_id,
            "bot_id": bot_id,
            "doc_name": name,
            "chunk_index": i
        }
        
    if not docs:
        return 0

    # 2. Check and create Qdrant collection if not exists
    try:
        collections = client.get_collections().collections
        exists = any(c.name == collection_name for c in collections)
        if not exists:
            # Detect embedding dimension
            dummy_vector = embeddings_model.embed_query("test")
            vector_size = len(dummy_vector)
            
            client.create_collection(
                collection_name=collection_name,
                vectors_config=qdrant_models.VectorParams(
                    size=vector_size,
                    distance=qdrant_models.Distance.COSINE
                )
            )
    except Exception as e:
        raise RuntimeError(f"Failed to check/create Qdrant collection: {e}")

    # 3. Store in Qdrant using add_documents
    vector_store = Qdrant(
        client=client,
        collection_name=collection_name,
        embeddings=embeddings_model
    )
    vector_store.add_documents(docs)
    
    return len(docs)

def delete_document_chunks(bot_id: int, doc_id: int):
    """Delete all indexed chunks for a document from Qdrant."""
    client = get_qdrant_client()
    collection_name = f"bot_{bot_id}"
    
    try:
        collections = client.get_collections().collections
        if not any(c.name == collection_name for c in collections):
            return
            
        client.delete(
            collection_name=collection_name,
            points_selector=qdrant_models.Filter(
                must=[
                    qdrant_models.FieldCondition(
                        key="metadata.doc_id",
                        match=qdrant_models.MatchValue(value=doc_id),
                    )
                ]
            )
        )
    except Exception as e:
        print(f"Error deleting chunks from Qdrant: {e}")

def delete_bot_collection(bot_id: int):
    """Delete the entire Qdrant collection for a bot when the bot is deleted."""
    client = get_qdrant_client()
    collection_name = f"bot_{bot_id}"
    try:
        collections = client.get_collections().collections
        if any(c.name == collection_name for c in collections):
            client.delete_collection(collection_name)
    except Exception as e:
        print(f"Error deleting Qdrant collection for bot {bot_id}: {e}")

def retrieve_context(
    bot_id: int,
    query: str,
    embeddings_model,
    technique: str = "vector",
    top_k: int = 4
) -> List[Dict[str, Any]]:
    """Retrieve top chunks using Qdrant vector store and optional BM25 keyword matching (Ensemble)."""
    client = get_qdrant_client()
    collection_name = f"bot_{bot_id}"
    
    # Check if collection exists
    try:
        collections = client.get_collections().collections
        if not any(c.name == collection_name for c in collections):
            return []
    except Exception:
        return []

    # Initialize vector store
    vector_store = Qdrant(
        client=client,
        collection_name=collection_name,
        embeddings=embeddings_model
    )
    
    vector_retriever = vector_store.as_retriever(search_kwargs={"k": top_k})
    
    if technique == "vector":
        docs = vector_retriever.invoke(query)
    elif technique == "keyword" or technique == "hybrid":
        # Construct BM25 retriever dynamically by scrolling all collection documents
        try:
            # Scroll to get all chunks in collection (up to 10k documents)
            response = client.scroll(
                collection_name=collection_name,
                limit=10000,
                with_payload=True,
                with_vectors=False
            )
            points = response[0]
            all_docs = [
                Document(page_content=p.payload["page_content"], metadata=p.payload["metadata"])
                for p in points if "page_content" in p.payload
            ]
            
            if all_docs:
                bm25_retriever = BM25Retriever.from_documents(all_docs)
                bm25_retriever.k = top_k
                
                if technique == "keyword":
                    docs = bm25_retriever.invoke(query)
                else:  # hybrid
                    ensemble = EnsembleRetriever(
                        retrievers=[vector_retriever, bm25_retriever],
                        weights=[0.7, 0.3]
                    )
                    docs = ensemble.invoke(query)
            else:
                docs = vector_retriever.invoke(query)
        except Exception as e:
            print(f"Failed to build BM25 retriever: {e}. Falling back to pure vector search.")
            docs = vector_retriever.invoke(query)
    else:
        docs = vector_retriever.invoke(query)

    results = []
    for doc in docs:
        results.append({
            "content": doc.page_content,
            "metadata": doc.metadata,
            "vec_score": 1.0,  # Relative indicator
            "kw_score": 0.0
        })
        
    return results[:top_k]
