"""
LangChain configuration module for managing LLMs, embeddings, and vector stores.
"""
import os
import time
from collections import deque
from typing import Optional, Dict, Any, List
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_anthropic import ChatAnthropic
from langchain_community.llms import Ollama
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from langchain_core.output_parsers import JsonOutputParser, PydanticOutputParser
from pydantic import BaseModel, Field
from utils import Config

config = Config()

# Registry of available models per provider
AVAILABLE_MODELS = {
    "openai": {
        "llm": [
            {"id": "chatgpt-4o-latest", "name": "ChatGPT-4o (Latest)"},
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
            {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
            {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
        ],
        "embedding": [
            {"id": "text-embedding-3-large", "name": "Text Embedding 3 Large"},
            {"id": "text-embedding-3-small", "name": "Text Embedding 3 Small"},
            {"id": "text-embedding-ada-002", "name": "Text Embedding Ada 002"},
        ]
    },
    "gemini": {
        "llm": [
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
            {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
            {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
        ],
        "embedding": [
            {"id": "models/gemini-embedding-001", "name": "Gemini Embedding 001"},
            {"id": "models/text-embedding-004", "name": "Text Embedding 004"},
        ]
    },
    "anthropic": {
        "llm": [
            {"id": "claude-opus-4-5", "name": "Claude Opus 4.5"},
            {"id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5"},
            {"id": "claude-haiku-3-5", "name": "Claude Haiku 3.5"},
            {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
        ],
        "embedding": []  # Anthropic doesn't provide embeddings
    },
    "ollama": {
        "llm": [],  # Dynamic - depends on installed models
        "embedding": []  # Dynamic - depends on installed models
    }
}

class LangChainManager:
    def __init__(self):
        self.config = config
        self.llm_cache = {}
        self.embedding_cache = {}
        self.vectorstore_cache = {}
        # Add global rate limiting for all instances
        self.request_times = deque()

    def update_model_config(self, provider: str = None, llm_model: str = None, embedding_model: str = None):
        """
        Dynamically update LLM provider and/or models at runtime.
        Clears relevant caches when configuration changes.
        """
        changed = False

        if provider and provider != self.config.LLM_PROVIDER:
            self.config.LLM_PROVIDER = provider
            self.llm_cache.clear()
            self.embedding_cache.clear()
            self.vectorstore_cache.clear()
            changed = True

        if llm_model and llm_model != self.config.LLM_MODEL:
            self.config.LLM_MODEL = llm_model
            # Clear only LLM cache
            self.llm_cache.clear()
            changed = True

        if embedding_model and embedding_model != self.config.EMBEDDING_MODEL:
            self.config.EMBEDDING_MODEL = embedding_model
            # Clear embedding and vectorstore cache
            self.embedding_cache.clear()
            self.vectorstore_cache.clear()
            changed = True

        return changed

    def get_current_config(self) -> Dict[str, Any]:
        """Return current model configuration"""
        return {
            "provider": self.config.LLM_PROVIDER,
            "llm_model": self.config.LLM_MODEL,
            "embedding_model": self.config.EMBEDDING_MODEL,
        }

    def get_available_models(self) -> Dict[str, Any]:
        """Return the registry of available models"""
        return AVAILABLE_MODELS

    def rate_limit_check(self, provider: str = "gemini", embeddings: bool = False):
        """Check and handle rate limiting for LLM and embedding requests"""
        if provider == "gemini":
            current_time = time.time()

            # Remove timestamps older than 60 seconds
            while self.request_times and current_time - self.request_times[0] > 60:
                self.request_times.popleft()

            # Check if we've reached the limit
            # Embeddings: 100 per minute (use 95 to be safe)
            # Chat/LLM: 10 per minute (use 9 to be safe)
            limit = 95 if embeddings else 9

            if len(self.request_times) >= limit:
                sleep_time = 60 - (current_time - self.request_times[0]) + 1
                request_type = "Embedding" if embeddings else "LLM"
                print(f"{request_type} rate limit reached. Waiting {sleep_time:.1f} seconds...")
                time.sleep(sleep_time)
                # Clean up old timestamps after waiting
                current_time = time.time()
                while self.request_times and current_time - self.request_times[0] > 60:
                    self.request_times.popleft()

            # Record this request
            self.request_times.append(current_time)
            request_type = "embedding" if embeddings else "LLM"
            print(f"Rate limit check ({request_type}): {len(self.request_times)} requests in last 60 seconds")

    def get_llm(self, provider: str = None, model: str = None) -> Any:
        """Get LLM instance with caching"""
        provider = provider or self.config.LLM_PROVIDER
        model = model or self.config.LLM_MODEL

        cache_key = f"{provider}:{model}"
        if cache_key in self.llm_cache:
            return self.llm_cache[cache_key]

        if provider == "gemini":
            llm = ChatGoogleGenerativeAI(
                model=model,
                google_api_key=self.config.GOOGLE_API_KEY,
                temperature=0,
                max_tokens=None,
                timeout=None,
                max_retries=2,
            )
        elif provider == "openai":
            llm = ChatOpenAI(
                model=model,
                openai_api_key=self.config.OPENAI_API_KEY,
                temperature=0,
                max_tokens=None,
                timeout=None,
                max_retries=2,
            )
        elif provider == "anthropic":
            llm = ChatAnthropic(
                model=model,
                anthropic_api_key=self.config.ANTHROPIC_API_KEY,
                temperature=0,
                max_tokens=None,
                timeout=None,
                max_retries=2,
            )
        elif provider == "ollama":
            # Fix: Ensure proper URL format for Ollama
            ollama_host = self.config.OLLAMA_HOST or "http://localhost:11434"

            # Add protocol if missing
            if not ollama_host.startswith(('http://', 'https://')):
                ollama_host = f"http://{ollama_host}"

            # Add default port if not specified
            if ':' not in ollama_host.split('://')[-1]:
                ollama_host = f"{ollama_host}:11434"
            llm = Ollama(
                model=model,
                base_url=ollama_host,
                temperature=0,
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")

        self.llm_cache[cache_key] = llm
        return llm

    def get_embeddings(self, model: str = None) -> Any:
        """Get embeddings instance with caching"""
        model = model or self.config.EMBEDDING_MODEL

        if model in self.embedding_cache:
            return self.embedding_cache[model]

        if "gemini" in model:
            embeddings = GoogleGenerativeAIEmbeddings(
                model=model,
                google_api_key=self.config.GOOGLE_API_KEY,
                maxBatchSize=100
            )
        elif "text-embedding" in model or self.config.LLM_PROVIDER == "openai":
            embeddings = OpenAIEmbeddings(
                model=model,
                openai_api_key=self.config.OPENAI_API_KEY
            )
        else:
            # Default to OpenAI embeddings
            embeddings = OpenAIEmbeddings(
                openai_api_key=self.config.OPENAI_API_KEY
            )

        self.embedding_cache[model] = embeddings
        return embeddings

    def get_vectorstore(self, collection_name: str = None, persist_directory: str = None) -> Chroma:
        """Get ChromaDB vectorstore instance"""
        collection_name = collection_name or self.config.COLLECTION_NAME
        persist_directory = persist_directory or self.config.CHROMADB_PATH

        cache_key = f"{collection_name}:{persist_directory}"
        if cache_key in self.vectorstore_cache:
            return self.vectorstore_cache[cache_key]

        embeddings = self.get_embeddings()
        vectorstore = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=persist_directory
        )

        self.vectorstore_cache[cache_key] = vectorstore
        return vectorstore

# Global instance
langchain_manager = LangChainManager()
