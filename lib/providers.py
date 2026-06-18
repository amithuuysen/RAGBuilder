import requests
import json
import logging
from langchain_community.chat_models import ChatOllama
from langchain_community.embeddings import OllamaEmbeddings
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

logger = logging.getLogger(__name__)

def get_ollama_models(api_url: str):
    """Fetch models from Ollama."""
    url = f"{api_url.rstrip('/')}/api/tags"
    try:
        response = requests.get(url, timeout=3)
        if response.status_code == 200:
            data = response.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception as e:
        logger.warning(f"Failed to fetch models from Ollama at {url}: {e}")
    return []

def get_lm_studio_models(api_url: str):
    """Fetch models from LM Studio (OpenAI-compatible)."""
    url = f"{api_url.rstrip('/')}/v1/models"
    try:
        response = requests.get(url, timeout=3)
        if response.status_code == 200:
            data = response.json()
            return [m["id"] for m in data.get("data", [])]
    except Exception as e:
        logger.warning(f"Failed to fetch models from LM Studio at {url}: {e}")
    return []

def get_embeddings_model(provider: str, api_url: str, model: str):
    """Get LangChain Embeddings instance."""
    if not model:
        return None
        
    if provider == "ollama":
        return OllamaEmbeddings(
            base_url=api_url.rstrip('/'),
            model=model
        )
    elif provider == "lm_studio":
        return OpenAIEmbeddings(
            openai_api_base=f"{api_url.rstrip('/')}/v1",
            openai_api_key="lm-studio",
            model=model
        )
    raise ValueError(f"Unsupported provider: {provider}")

def get_llm_model(provider: str, api_url: str, model: str, temperature: float = 0.2):
    """Get LangChain Chat LLM instance with custom temperature."""
    if provider == "ollama":
        return ChatOllama(
            base_url=api_url.rstrip('/'),
            model=model,
            temperature=temperature
        )
    elif provider == "lm_studio":
        return ChatOpenAI(
            openai_api_base=f"{api_url.rstrip('/')}/v1",
            openai_api_key="lm-studio",
            model=model,
            temperature=temperature
        )
    raise ValueError(f"Unsupported provider: {provider}")
