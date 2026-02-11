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

class LangChainManager:
    def __init__(self):
        self.config = config
        self.llm_cache = {}
        self.embedding_cache = {}
        self.vectorstore_cache = {}
        # Add global rate limiting for all instances
        self.request_times = deque()
    
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
        elif "openai" in model or "text-embedding" in model:
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