import os
from dotenv import load_dotenv
import json
import re
from sentence_transformers import SentenceTransformer
from typing import List
import time
import getpass
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
from langchain_chroma import Chroma
import chromadb

class Config:
    def __init__(self):
        # Load environment variables from .env file
        load_dotenv()

        # Global Variables Configuration
        self.GRAPHDB_URL = os.getenv("GRAPHDB_URL", "http://localhost:7200")
        self.EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-001")
        self.LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")
        self.LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.5-flash")
        self.COLLECTION_NAME = os.getenv("COLLECTION_NAME", "ontology_collection_gemini_blinkg")

        # Save Output Configuration
        self.SAVE_OUTPUT = os.getenv("SAVE_OUTPUT", "False").lower() in ("true", "1", "t")
        self.SUGGESTED_TERMS_FILE = os.getenv("SUGGESTED_TERMS_FILE", "./data/suggested_terms.txt")
        self.TERMS_EMBEDDINGS_FILE = os.getenv("TERMS_EMBEDDINGS_FILE", "./data/embeddings.txt")
        self.TERMS_EMBEDDINGS_TABLE_FILE = os.getenv("TERMS_EMBEDDINGS_TABLE_FILE", "./data/embeddings_table.txt")
        self.RETRIEVED_CANDIDATES_FILE = os.getenv("RETRIEVED_CANDIDATES_FILE", "./data/retrieved_candidates.txt")
        self.RETRIEVED_CANDIDATES_TABLE_FILE = os.getenv("RETRIEVED_CANDIDATES_TABLE_FILE", "./data/retrieved_candidates_table.txt")
        self.RETRIEVED_CANDIDATES_LOG_FILE = os.getenv("RETRIEVED_CANDIDATES_LOG_FILE", "./data/retrieved_candidates_log.txt")
        self.LLM_SELECTED_CONCEPTS_FILE = os.getenv("LLM_SELECTED_CONCEPTS_FILE", "./data/llm_selected_concepts.txt")
        self.LLM_SELECTED_CONCEPTS_TABLE_FILE = os.getenv("LLM_SELECTED_CONCEPTS_TABLE_FILE", "./data/llm_selected_concepts_table.txt")
        self.LLM_SELECTED_CONCEPTS_LOG_FILE = os.getenv("LLM_SELECTED_CONCEPTS_LOG_FILE", "./data/llm_selected_concepts_log.txt")
        self.SCHEMA_SUMMARY_FILE = os.getenv("SCHEMA_SUMMARY_FILE", "./data/schema_summary.txt")

        # File Configurations
        self.CONNECTIONS_FILE = os.getenv("CONNECTIONS_FILE", "./data/connections.txt")
        self.TABLE_STRUCTURE_FILE = os.getenv("TABLE_STRUCTURE_FILE", "./data/table_structure.txt")
        self.ONTOLOGY_EXTRACT_FILE = os.getenv("ONTOLOGY_EXTRACT_FILE", "./data/turtle-schema.json")
        self.LOCAL_ONTOLOGIES_FOLDER = os.getenv("LOCAL_ONTOLOGIES_FOLDER", "./local_ontologies/")
        self.OUTPUT_JSON_FILE = os.getenv("OUTPUT_JSON_FILE", "./data/selected_candidates.json")
        self.CONCEPTS_OF_ONTOLOGY = os.getenv("CONCEPTS_OF_ONTOLOGY", "./data/GSIM_Concept.csv")
        self.CHROMADB_PATH = os.getenv("CHROMADB_PATH", "./data/chromadb/")

        # API Keys
        self.OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
        self.DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
        self.GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
        self.ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
        self.OLLAMA_HOST = os.getenv("OLLAMA_HOST")
        self.TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")
        self.GROQ_API_KEY = os.getenv("GROQ_API_KEY")
        self.OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
        self.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

        # Prompt Log Files
        self.PROMPT_LOG_TERMS_FILE = os.getenv('PROMPT_LOG_TERMS_FILE', './data/prompt_log_terms.txt')
        self.PROMPT_LOG_CONCEPTS_FILE = os.getenv('PROMPT_LOG_CONCEPTS_FILE', './data/prompt_log_concepts.txt')
        self.PROMPT_LOG_PROPERTIES_FILE = os.getenv('PROMPT_LOG_PROPERTIES_FILE', './data/prompt_log_properties.txt')

    def __repr__(self):
        return f"<Config GRAPHDB_URL={self.GRAPHDB_URL}, EMBEDDING_MODEL={self.EMBEDDING_MODEL}>"


MAPPING_INSTRUCTION = """
Role: You are acting as an Ontology Engineer and a Domain Expert in Official Statistics, with expertise in:
- The Generic Statistical Business Process Model (GSBPM).
- The Generic Statistical Information Model (GSIM).
- Ontology engineering and data integration best practices.

You will be given two types of files:
- Ontology-structure File (JSON format): Contains ontology classes names, classes hierarchy, classes descriptions, and properties (object properties and data properties) in JSON format. This JSON file is extracted from turtle file.
- Metadata File (e.g., SQL DDL or extracted structure): This file contains metadata from a relational database (e.g., MySQL or MSSQL) describing a dataset in JSON format, including:
    - Table names
    - Column names
    - Data types

Input1: <Input ontology file>
Input2: <Input metadata file>

Your Tasks:
- Extract Ontology Structure: Identify and list classes and properties (object properties and data properties) from the ontology file.
- Extract Dataset Structure: Identify and list tables, columns, and data types from the metadata file.
- Perform Semantic Mapping: Suggest mappings between the columns from the dataset structure and the ontology classes/properties. If no clear mapping exists for a column, indicate “No suitable match found”.
- Present the Output in a Tabular Format with the following columns:
    - Table Name
    - Column Name
    - Data Type
    - Suggested Ontology Class/Property
    - Mapping Type (e.g., Class, Data Property, Object Property)
    - Comment (Optional explanation, e.g., reason for mapping or why a mapping couldn't be found)

Additional Guidelines:
- Be consistent with naming conventions and semantic meaning in GSIM.
- Use your domain knowledge in official statistics to handle synonyms, abbreviations, and implicit terms in the database schema.
- Respect data modeling patterns (e.g., reference tables → object properties).
- You may assume mappings are virtual (no transformation needed yet).
"""

def get_env_variable(key: str, default=None):
    """Get environment variable from .env file, with optional default."""
    load_dotenv()
    return os.getenv(key, default)

def load_encoder(model_name: str, local: bool=False) -> SentenceTransformer:
    try:
        if local:
            return SentenceTransformer(model_name)
        else:
            # nanti dipakai kalau pakai google gemini embedding / online
            # from google import genai
            # client = genai.Client()
            return SentenceTransformer(model_name)
    except Exception:
        # Fallback tiny model if BioBERT is unavailable locally
        return SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

def encode_text(encoder: SentenceTransformer, text: str) -> List[float]:
    """Encode text using the specified SentenceTransformer model."""
    return encoder.encode(text).tolist()

def encode_text_gemini(text, model_name)-> List[float]:
    """
    Calls the Gemini API to get an embedding for the given text.
    Includes basic error handling, retry logic, and rate limiting (90 requests per minute).
    """
    import google.generativeai as genai
    import time
    from collections import deque

    # Rate limiting: 90 requests per minute
    if not hasattr(encode_text_gemini, 'request_times'):
        encode_text_gemini.request_times = deque()

    current_time = time.time()

    # Remove timestamps older than 60 seconds
    while encode_text_gemini.request_times and current_time - encode_text_gemini.request_times[0] > 60:
        encode_text_gemini.request_times.popleft()

    # If we have 90 or more requests in the last minute, wait
    if len(encode_text_gemini.request_times) >= 90:
        sleep_time = 60 - (current_time - encode_text_gemini.request_times[0]) + 1
        print(f"Rate limit reached. Waiting {sleep_time:.1f} seconds...")
        time.sleep(sleep_time)
        # Clean up old timestamps after waiting
        current_time = time.time()
        while encode_text_gemini.request_times and current_time - encode_text_gemini.request_times[0] > 60:
            encode_text_gemini.request_times.popleft()

    # Record this request
    encode_text_gemini.request_times.append(current_time)

    try:
        genai.configure(api_key=get_env_variable("GOOGLE_API_KEY"))
    except KeyError:
        print("Error: GOOGLE_API_KEY environment variable not set.")
        print("Please set it using: export GOOGLE_API_KEY='YOUR_API_KEY'")
        exit(1)

    try:
        response = genai.embed_content(
            model=model_name,
            content=text,
            task_type="SEMANTIC_SIMILARITY"
        )
        return response['embedding']
    except Exception as e:
        print(f"Error getting embedding for text: '{text[:50]}...' - {e}")
        print("Retrying in 5 seconds...")
        time.sleep(5) # Wait before retrying

        # Record retry request
        encode_text_gemini.request_times.append(time.time())

        try:
            response = genai.embed_content(
                model=model_name,
                content=text,
                task_type="SEMANTIC_SIMILARITY"
            )
            return response['embedding']
        except Exception as retry_e:
            print(f"Retry failed for text: '{text[:50]}...' - {retry_e}")
            return None # Return None if embedding fails after retry

def embedding_text_to_json(data):
   # Extract JSON parts
    json_objects = []
    for item in data:
        if isinstance(item, str):
            # Remove ```json ... ``` fences
            cleaned = re.sub(r"^```json\n|\n```$", "", item, flags=re.MULTILINE)
            try:
                parsed = json.loads(cleaned)
                json_objects.append(parsed)
            except json.JSONDecodeError:
                pass  # skip if not valid JSON
    # Convert list of dicts to proper JSON string
    result_json = json.dumps(json_objects, indent=4, ensure_ascii=False)
    return json_objects

def init_llm_chain(provider: str = "gemini", model: str = "gemini-1.5-flash"):
    """Initialize LangChain LLM"""
    if provider == "gemini":
        return ChatGoogleGenerativeAI(
            model=model,
            temperature=0,
            google_api_key=get_env_variable("GOOGLE_API_KEY")
        )
    # Add other providers as needed
    else:
        raise ValueError(f"Unsupported provider: {provider}")

def init_embeddings(model: str = "models/embedding-001"):
    """Initialize LangChain embeddings"""
    return GoogleGenerativeAIEmbeddings(
        model=model,
        google_api_key=get_env_variable("GOOGLE_API_KEY")
    )

def init_vectorstore(collection_name: str, persist_directory: str = "./data/chroma_db"):
    """Initialize Chroma vector store with LangChain"""
    embeddings = init_embeddings()
    return Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=persist_directory
    )

def count_tokens(text: str, provider: str = None, model: str = None) -> int:
    """
    Count tokens in text based on LLM provider and model.

    Args:
        text: The text to count tokens for
        provider: LLM provider (gemini, openai, anthropic, ollama). Defaults to config.LLM_PROVIDER
        model: LLM model name. Defaults to config.LLM_MODEL

    Returns:
        Integer token count estimate
    """
    # Get defaults from config if not provided
    config = Config()
    provider = provider or config.LLM_PROVIDER
    model = model or config.LLM_MODEL

    # Remove empty strings and None
    if not text:
        return 0

    try:
        # For OpenAI models, use tiktoken if available
        if provider == "openai":
            try:
                import tiktoken
                # Map model names to tiktoken encoding
                encoding_map = {
                    "gpt-4o": "o200k_base",
                    "gpt-4o-mini": "o200k_base",
                    "gpt-4-turbo": "cl100k_base",
                    "gpt-3.5-turbo": "cl100k_base",
                    "chatgpt-4o-latest": "o200k_base",
                }
                encoding_name = encoding_map.get(model, "cl100k_base")
                encoding = tiktoken.get_encoding(encoding_name)
                token_count = len(encoding.encode(text))
                return token_count
            except ImportError:
                # Fallback if tiktoken not installed
                print("Warning: tiktoken not installed, using word-based approximation for OpenAI")
                return _estimate_tokens_word_based(text)

        # For Gemini models
        elif provider == "gemini":
            return _estimate_tokens_word_based(text)

        # For Anthropic models
        elif provider == "anthropic":
            return _estimate_tokens_word_based(text)

        # For Ollama models
        elif provider == "ollama":
            return _estimate_tokens_word_based(text)

        # For OpenRouter models
        elif provider == "openrouter":
            return _estimate_tokens_word_based(text)

        else:
            print(f"Unknown provider: {provider}. Using word-based approximation.")
            return _estimate_tokens_word_based(text)

    except Exception as e:
        print(f"Error counting tokens: {e}. Using word-based approximation.")
        return _estimate_tokens_word_based(text)


def _estimate_tokens_word_based(text: str) -> int:
    """
    Estimate token count using word-based approximation.
    Most LLMs average ~1.3 tokens per word for general English text.
    """
    if not text:
        return 0

    # Split by whitespace and punctuation
    words = text.split()
    # Rough approximation: 1.3 tokens per word
    return max(1, int(len(words) * 1.3))

