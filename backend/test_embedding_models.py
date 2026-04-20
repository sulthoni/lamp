#!/usr/bin/env python3
"""Test embedding model compatibility with OpenRouter."""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Test models
MODELS_TO_TEST = [
    ("qwen/qwen3-embedding-8b", "Qwen (works)"),
    ("mistralai/mistral-embed-2312", "Mistral Embed"),
    ("perplexity/pplx-embed-v1-4b", "Perplexity Embed"),
]

def test_model_direct_http(model_id: str):
    """Test if model is accessible via direct HTTP request."""
    import requests

    api_key = os.getenv("OPENROUTER_API_KEY")
    base_url = "https://openrouter.ai/api/v1"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model_id,
        "input": "test",
        "encoding_format": "float",
    }

    try:
        response = requests.post(
            f"{base_url}/embeddings",
            headers=headers,
            json=payload,
            timeout=10
        )
        print(f"  HTTP Status: {response.status_code}")
        if response.status_code == 200:
            print(f"  ✓ Model {model_id} IS available via HTTP")
            return True
        else:
            print(f"  ✗ Model {model_id} returned {response.status_code}")
            print(f"    Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"  ✗ HTTP request failed: {e}")
        return False

def test_model_langchain(model_id: str):
    """Test if model works with LangChain OpenAIEmbeddings."""
    from langchain_openai import OpenAIEmbeddings

    api_key = os.getenv("OPENROUTER_API_KEY")
    base_url = "https://openrouter.ai/api/v1"

    print(f"\n  Testing with LangChain OpenAIEmbeddings...")
    try:
        embeddings = OpenAIEmbeddings(
            model=model_id,
            api_key=api_key,
            base_url=base_url,
        )
        print(f"    ✓ Client initialized")

        # Try a simple embed
        result = embeddings.embed_query("test")
        print(f"    ✓ embed_query() succeeded, got {len(result)} dimensions")
        return True
    except Exception as e:
        print(f"    ✗ LangChain test failed: {type(e).__name__}: {e}")
        return False

def main():
    print("Testing OpenRouter embedding models...\n")

    for model_id, label in MODELS_TO_TEST:
        print(f"\n{'='*60}")
        print(f"Model: {label}")
        print(f"ID: {model_id}")
        print(f"{'='*60}")

        # Test 1: Direct HTTP
        print(f"1. Testing HTTP endpoint:")
        http_ok = test_model_direct_http(model_id)

        # Test 2: LangChain
        print(f"\n2. Testing LangChain client:")
        langchain_ok = test_model_langchain(model_id)

        if http_ok and langchain_ok:
            print(f"✓ {label}: FULLY COMPATIBLE")
        elif http_ok:
            print(f"⚠ {label}: Works via HTTP but NOT via LangChain")
        else:
            print(f"✗ {label}: NOT ACCESSIBLE")

if __name__ == "__main__":
    main()
