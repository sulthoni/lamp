"""
Module for embedding and storing documents using LangChain Chroma.
"""
import os
import json
from typing import List, Dict
from langchain_chroma import Chroma
from langchain_core.documents import Document
from interface import ConceptEmbedding
from langchain_config import langchain_manager
from langchain_community.vectorstores.utils import filter_complex_metadata

class SaveEmbedding:
    def __init__(self, collection_name: str = None):
        try:
            print(f"Initializing SaveEmbedding with collection: {collection_name}")
            print(f"Current embedding model: {langchain_manager.config.EMBEDDING_MODEL}")
            print(f"Current LLM provider: {langchain_manager.config.LLM_PROVIDER}")

            print("Getting embeddings client...")
            self.embeddings = langchain_manager.get_embeddings()
            print("✓ Embeddings client created successfully")

            print("Getting vectorstore...")
            self.vectorstore = langchain_manager.get_vectorstore(collection_name=collection_name)
            print("✓ Vectorstore created successfully")

            self.config = langchain_manager.config
            print("✓ SaveEmbedding initialized successfully")
        except Exception as e:
            print(f"✗ ERROR during SaveEmbedding initialization: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            raise

    def embed_documents_with_rate_limit(self, texts: List[str]) -> List[List[float]]:
        """Embed multiple documents with rate limiting"""
        embeddings_result = []

        for i, text in enumerate(texts, 1):
            # Apply rate limiting for each embedding request
            langchain_manager.rate_limit_check("gemini", embeddings=True)

            # Get embedding for this text
            embedding = self.embeddings.embed_query(text)
            embeddings_result.append(embedding)

            print(f"Embedded document {i}/{len(texts)}")

        return embeddings_result

    def embed_query_with_rate_limit(self, text: str) -> List[float]:
        """Embed a single query with rate limiting"""
        langchain_manager.rate_limit_check("gemini", embeddings=True)
        return self.embeddings.embed_query(text)

def load_document_from_json_langchain(json_data: List[Dict]) -> List[Document]:
    """Load documents from JSON data for LangChain Chroma"""
    documents = []
    i = 0

    for item in json_data:
        concept_id = item.get('URI', '')
        label = item.get('label', '')
        description = item.get('definition', '')
        explanatory_text = item.get('description', '')
        object_properties = item.get('objectProperties', [])
        data_properties = item.get('dataProperties', [])
        prefixed_URI = item.get('prefixedURI', '')

        # Fix: Handle synonyms properly - it's already a list
        similar_classes = item.get('similarClasses', [])
        synonyms = similar_classes if isinstance(similar_classes, list) else [similar_classes] if similar_classes else []

        i += 1
        print(f"Processing concept ID: {i} {concept_id}, Label: {label}")

        #### CHANGE IN THIS PART FOR EACH EXPERIMENT
        # Create structured text embedding using markdown format
        text_embedding = [f"# {label or ''} Class\n"]
        text_embedding.append(f"**IRI**: {concept_id or ''}\n")
        if description:
            text_embedding.append(f"**Definition**: {description}\n")
        if explanatory_text:
            text_embedding.append(f"**Description**: {explanatory_text}\n")
        if synonyms:
            # Fix: Filter out empty strings and join properly
            filtered_synonyms = [syn for syn in synonyms if syn and syn.strip()]
            if filtered_synonyms:
                text_embedding.append(f"**Synonyms**: {', '.join(filtered_synonyms)}\n")
        if prefixed_URI:
            text_embedding.append(f"**Prefixed IRI**: {prefixed_URI}\n")
        if data_properties:
            text_embedding.append("## Data Properties\n")
            for dp in data_properties:
                text_embedding.append(f"- **{dp.get('name', '')}**: Type = {dp.get('dataType', '')} (IRI: {dp.get('uriDataType', '')})\n")
        if object_properties:
            text_embedding.append("## Object Properties\n")
            for op in object_properties:
                text_embedding.append(f"- **{op.get('name', '')}**: Domain = {op.get('domain', '')} (IRI: {op.get('uriDomain', '')}), Range = {op.get('range', '')} (IRI: {op.get('uriRange', '')})\n")

        text_content = "\n".join(text_embedding)

        print(f"Generated text content for concept ID {concept_id} with length {len(text_content)} characters")
        print(text_content)
        print("-----")

        # Create metadata with proper types
        raw_metadata = {
            "id": concept_id or "",
            "label": label or "",
            "description": description or "",
            "explanatory_text": explanatory_text or "",
            # Fix: Join synonyms properly for metadata
            "synonyms": ", ".join(syn for syn in synonyms if syn and syn.strip()) if synonyms else "",
            "prefixed_URI": prefixed_URI or "",
            "data_properties": json.dumps(data_properties) if data_properties else "",
            "object_properties": json.dumps(object_properties) if object_properties else "",
            # Add additional metadata fields
            "data_properties_count": len(data_properties) if data_properties else 0,
            "object_properties_count": len(object_properties) if object_properties else 0,
            "has_data_properties": bool(data_properties),
            "has_object_properties": bool(object_properties),
            "synonyms_count": len([syn for syn in synonyms if syn and syn.strip()]) if synonyms else 0
        }

        # Create LangChain Document
        doc = Document(
            page_content=text_content,
            metadata=raw_metadata,
            id=concept_id
        )
        documents.append(doc)

    return documents

def save_embedding_logic(json_data: List[Dict], collection_name: str = None):
    """Save document embedding to ChromaDB using LangChain with rate limiting"""
    try:
        # Load documents
        documents = load_document_from_json_langchain(json_data)

        # Use default collection name if not provided
        if collection_name is None:
            collection_name = langchain_manager.config.COLLECTION_NAME

        print(f"Working with collection: '{collection_name}'")

        # Check if collection exists and delete if it does
        if collection_exists(collection_name):
            print(f"Collection '{collection_name}' exists. Deleting records...")
            delete_all_records_in_collection(collection_name)
        else:
            print(f"Collection '{collection_name}' does not exist.")

        # Create new collection
        print(f"Creating new collection '{collection_name}'...")
        save_embedding = create_new_collection(collection_name)
        vectorstore = save_embedding.vectorstore

        # Add documents to vector store with rate limiting
        print(f"Adding {len(documents)} documents to ChromaDB with rate limiting...")

        # Process documents in smaller batches to avoid rate limits
        batch_size = 10  # Smaller batch size for embeddings
        total_batches = (len(documents) + batch_size - 1) // batch_size

        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            batch_num = i // batch_size + 1

            # Apply rate limiting check before each batch
            langchain_manager.rate_limit_check("gemini", embeddings=True)

            # Filter metadata for each document in the batch to ensure compatibility
            filtered_batch = []
            for doc in batch:
                # Clean metadata to ensure ChromaDB compatibility
                cleaned_metadata = clean_metadata_for_chroma(doc.metadata)

                filtered_doc = Document(
                    page_content=doc.page_content,
                    metadata=cleaned_metadata,
                    id=doc.id
                )
                filtered_batch.append(filtered_doc)

            # Add batch to vector store
            try:
                vectorstore.add_documents(filtered_batch)
                print(f"Processed batch {batch_num}/{total_batches} successfully")
            except Exception as batch_error:
                print(f"Error processing batch {batch_num}: {batch_error}")
                # Continue with next batch instead of failing completely
                continue

        print(f"Collection '{collection_name}' created successfully with {len(documents)} documents.")
        return f"Ontology saved in ChromaDB using LangChain with rate limiting. Collection name: {collection_name}"

    except Exception as e:
        print(f"Error saving embedding with LangChain: {e}")
        return f"Error: {e}"

def save_to_chromadb_route(flatExportedSchemaJson_file, collection_name):
    """Save uploaded JSON schema file to ChromaDB using LangChain"""
    try:
        # Check file content type
        if flatExportedSchemaJson_file.mimetype != 'application/json':
            return {'error': 'Uploaded file must be JSON'}

        # Read and validate JSON
        try:
            flatExportedSchemaJson = flatExportedSchemaJson_file.read().decode('utf-8')
            json_data = json.loads(flatExportedSchemaJson)
        except Exception as e:
            return {'error': 'Invalid JSON file'}

        # Save data to ChromaDB using LangChain
        result = save_embedding_logic(json_data, collection_name)
        return {'message': f'Data saved to ChromaDB successfully using LangChain: {result}'}

    except Exception as e:
        return {'error': str(e)}

def get_chromadb_collections():
    """Get all collections from ChromaDB using LangChain"""

    try:
        # Create a dummy vectorstore to access the client
        save_embedding = SaveEmbedding()
        embeddings = save_embedding.embeddings
        vectorstore = save_embedding.vectorstore

        # Access the underlying ChromaDB client
        client = vectorstore._client
        collections = client.list_collections()

        collection_info = []
        for collection in collections:
            try:
                collection_data = {
                    "name": collection.name,
                    "metadata": collection.metadata,
                    "count": collection.count()
                }
                collection_info.append(collection_data)
            except Exception as e:
                collection_info.append({
                    "name": collection.name,
                    "error": f"Error getting collection info: {str(e)}"
                })

        return {
            "success": True,
            "message": f"Found {len(collection_info)} collections",
            "collections": collection_info
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Error accessing ChromaDB with LangChain: {str(e)}",
            "collections": []
        }

def clean_metadata_for_chroma(metadata: dict) -> dict:
    """Clean metadata to ensure compatibility with ChromaDB"""
    cleaned = {}

    for key, value in metadata.items():
        if value is None:
            cleaned[key] = ""
        elif isinstance(value, (str, int, float, bool)):
            cleaned[key] = value
        elif isinstance(value, list):
            # Convert lists to comma-separated strings
            if all(isinstance(item, str) for item in value):
                cleaned[key] = ', '.join(value)
            else:
                cleaned[key] = str(value)
        elif isinstance(value, dict):
            # Convert dicts to JSON strings
            cleaned[key] = json.dumps(value)
        else:
            # Convert other types to strings
            cleaned[key] = str(value)

    return cleaned

def collection_exists(collection_name: str) -> bool:
    """Check if a collection exists in ChromaDB"""
    try:
        save_embedding = SaveEmbedding()
        client = save_embedding.vectorstore._client
        collections = client.list_collections()

        for collection in collections:
            if collection.name == collection_name:
                return True
        return False
    except Exception as e:
        print(f"Error checking collection existence: {e}")
        return False

def delete_all_records_in_collection(collection_name: str) -> bool:
    """Delete all records in a collection if it exists"""
    try:
        if collection_exists(collection_name):
            save_embedding = SaveEmbedding(collection_name=collection_name)

            # Get count before deletion
            count_before = save_embedding.vectorstore._collection.count()
            print(f"Records in collection '{collection_name}' before deletion: {count_before}")

            # Get records IDs to delete
            all_ids = [str(id) for id in save_embedding.vectorstore._collection.get()['ids']]
            print(f"Deleting {len(all_ids)} records from collection '{collection_name}'...")

            if(len(all_ids) == 0):
                print(f"No records to delete in collection '{collection_name}'.")
                return True

            # Delete all records from the collection
            save_embedding.vectorstore._collection.delete(all_ids)

            # Get count after deletion
            count_after = save_embedding.vectorstore._collection.count()
            print(f"Records in collection '{collection_name}' after deletion: {count_after}")

            print(f"All records in collection '{collection_name}' deleted successfully.")
            return True
        else:
            print(f"Collection '{collection_name}' does not exist.")
            return False
    except Exception as e:
        print(f"Error deleting records from collection '{collection_name}': {e}")
        return False

def create_new_collection(collection_name: str):
    """Create a new collection with the given name"""
    try:
        # Create new SaveEmbedding instance with the collection name
        save_embedding = SaveEmbedding(collection_name=collection_name)
        print(f"Collection '{collection_name}' created successfully.")
        return save_embedding
    except Exception as e:
        print(f"Error creating collection '{collection_name}': {e}")
        raise e
