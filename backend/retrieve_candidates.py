"""
Module for searching candidates using LangChain Chroma.
"""
import os
import json
from typing import List, Dict, Any, Tuple
from langchain_chroma import Chroma
from interface import SimilarConcept, Candidate, ConceptEmbedding
from langchain_config import langchain_manager

class CandidateRetriever:
    def __init__(self, collection_name: str = None, persist_directory: str = None):
        self.collection_name = collection_name or langchain_manager.config.COLLECTION_NAME
        self.persist_directory = persist_directory or langchain_manager.config.CHROMADB_PATH
        self.vectorstore = langchain_manager.get_vectorstore(self.collection_name, self.persist_directory)
        self.config = langchain_manager.config

    def retrieve_candidates(self, terms: List[str], k: int = 5) -> List[Candidate]:
        """Retrieve top-k candidates for each term using LangChain ChromaDB"""
        try:
            query_results = []

            for term in terms:
                # Use LangChain's similarity search
                docs_and_scores = self.vectorstore.similarity_search_with_score(term, k=k)

                candidates = []
                for doc, score in docs_and_scores:
                    # Convert distance to similarity (assuming cosine distance)
                    similarity = 1 - score if score is not None else None

                    # Extract metadata
                    metadata = doc.metadata

                    candidate = SimilarConcept(
                        id=metadata.get("id", ""),
                        label=metadata.get("label", ""),
                        description=metadata.get("description", ""),
                        explanatory_text=metadata.get("explanatory_text", ""),
                        synonyms=metadata.get("synonyms", []),
                        similarity=similarity,
                        data_properties=json.loads(metadata.get("data_properties", "[]")) if metadata.get("data_properties") else [],
                        object_properties=json.loads(metadata.get("object_properties", "[]")) if metadata.get("object_properties") else [],
                    )
                    candidates.append(candidate)

                query_results.append(Candidate(
                    term=term,
                    candidates=candidates
                ))

            return query_results

        except Exception as e:
            print(f"Error retrieving candidates: {e}")
            return []

    def retrieve_single_term(self, term: str, k: int = 5) -> Candidate:
        """Retrieve candidates for a single term"""
        results = self.retrieve_candidates([term], k)
        return results[0] if results else Candidate(term=term, candidates=[])

def retrieve_candidates_logic(query_json: Dict[str, Any], collection_name: str) -> Dict[str, Any]:
    """
    Handle retrieve candidates logic using LangChain - refactored version
    """

    # Initialize the retriever
    retriever = CandidateRetriever(collection_name)

    retrieved_candidates_file = retriever.config.RETRIEVED_CANDIDATES_FILE
    retrieved_candidates_table_file = retriever.config.RETRIEVED_CANDIDATES_TABLE_FILE
    retrieved_candidates_log_file = retriever.config.RETRIEVED_CANDIDATES_LOG_FILE

    # Extract parameters (with defaults)
    queries = query_json.get('queries', [])
    queries_table = query_json.get('queries_table', [])
    n_results = query_json.get('n_results', 7)

    if not queries_table:
        return {'error': 'queries array is required and cannot be empty.'}

    if(retriever.config.SAVE_OUTPUT):
        # Check if files exist and have content
        if (os.path.exists(retrieved_candidates_log_file) and os.path.getsize(retrieved_candidates_log_file) > 0 and
            os.path.exists(retrieved_candidates_table_file) and os.path.getsize(retrieved_candidates_table_file) > 0):

            print(f"Using existing retrieved candidates from files")

            try:
                # with open(retrieved_candidates_file, 'r') as f:
                #     file_content = f.read().strip()
                #     results = []
                #     for line in file_content.split('\n'):
                #         if line.strip():
                #             try:
                #                 candidate = eval(line.strip())
                #                 results.append(candidate)
                #             except:
                #                 pass

                with open(retrieved_candidates_table_file, 'r') as f:
                    file_content_table = f.read().strip()
                    results_table = []
                    for line in file_content_table.split('\n'):
                        if line.strip():
                            try:
                                candidate_table = eval(line.strip())
                                results_table.append(candidate_table)
                            except:
                                pass

                with open(retrieved_candidates_log_file, 'r') as log_file:
                    logging_info = log_file.read()

                return {
                    'message': 'Used existing retrieved candidates from files',
                    'collection_name': collection_name,
                    'n_results': n_results,
                    'query_count': len(queries),
                    'results': [],
                    'results_table': results_table,
                    'log': logging_info
                }

            except Exception as e:
                print(f"Error reading existing files: {e}. Proceeding with candidate retrieval.")

    # Execute retrieval
    print(f"Retrieving candidates from collection: {collection_name}")
    # results = retriever.retrieve_candidates(queries, n_results)
    results = [] # Disabled column retrieval
    results_table = retriever.retrieve_candidates(queries_table, n_results) if queries_table else []

    # Generate log
    logging_info = _generate_retrieval_log(results, results_table)

    # Save results to text files
    with open(retrieved_candidates_file, 'w') as f:
        for candidate in results:
            f.write(f"{candidate}\n")

    with open(retrieved_candidates_table_file, 'w') as f:
        for candidate in results_table:
            f.write(f"{candidate}\n")

    with open(retrieved_candidates_log_file, 'w') as log_file:
        log_file.write(logging_info)

    return {
        'message': 'Candidates retrieved successfully using LangChain',
        'collection_name': collection_name,
        'n_results': n_results,
        'query_count': len(queries),
        'results': results,
        'results_table': results_table,
        'log': logging_info
    }

def _generate_retrieval_log(results: List[Candidate], results_table: List[Candidate]) -> str:
    """Generate log from retrieval results"""
    logging_info = ''

    # Log column results
    for i, candidate in enumerate(results):
        if i > 0:
            logging_info += "\n"
        logging_info += f"Term: {candidate.term}\n"
        for idx, cand in enumerate(candidate.candidates, 1):
            logging_info += f"  Candidate {idx}: {cand.label} (ID: {cand.id}) | Similarity: {cand.similarity:.4f}\n"

    # Log table results
    if results_table:
        logging_info += "\n\n===================== Table Results ====================\n"
        for j, candidate in enumerate(results_table):
            if j > 0:
                logging_info += "\n"
            logging_info += f"Term: {candidate.term}\n"
            for idx, cand in enumerate(candidate.candidates, 1):
                logging_info += f"  Candidate {idx}: {cand.label} (ID: {cand.id}) | Similarity: {cand.similarity:.4f}\n"

    return logging_info
