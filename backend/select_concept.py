"""
Module for selecting similar concepts using LangChain.
"""
import os
import json
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_config import langchain_manager
from interface import Candidate, SimilarConcept, ConceptSelection, ConceptSelectionTable
from prompt_logger import format_prompt_log, append_prompt_log, init_prompt_log

class ConceptSelectionChain:
    def __init__(self):
        self.llm = langchain_manager.get_llm()
        self.row_parser = PydanticOutputParser(pydantic_object=ConceptSelection)
        self.table_parser = PydanticOutputParser(pydantic_object=ConceptSelectionTable)
        self.config = langchain_manager.config
        self._setup_prompts()
        self._setup_chains()

        # Prompt log file for this process
        self.prompt_log_file = getattr(self.config, 'PROMPT_LOG_CONCEPTS_FILE', './data/prompt_log_concepts.txt')

    def _setup_prompts(self):
        """Setup prompt templates"""
        #### CHANGE IN THIS PART FOR EACH EXPERIMENT
        self.prompt_per_row = ChatPromptTemplate.from_template(
            """Role:
                You are an expert in ontology engineering and semantic data integration.

                Instructions:
                You are given a term and a list of candidate concepts. Your task is to select the most appropriate concept that matches the term.

                Context:
                The candidate concepts have been selected from a vector database using text embedding similarity. Each candidate has:
                - ID: Unique identifier
                - Label: Human-readable name
                - Description: Brief description
                - Explanatory_text: Detailed explanation
                - Synonyms: Alternative terms
                - Similarity: Cosine similarity score with the input term
                - Data Properties: List of data properties associated with the concept
                - Object Properties: List of object properties associated with the concept

                Term: {term}

                Candidates:
                {candidates_text}

                Analyze each candidate carefully and select the most appropriate one. Consider:
                1. Semantic similarity between the term and candidate labels
                2. Relevance of descriptions and explanatory text
                3. Presence of synonyms that match the term
                4. Overall conceptual alignment

                {format_instructions}

                Provide your selection with a confidence score (0.0 to 1.0) and clear reasoning."""
        )

        #### CHANGE IN THIS PART FOR EACH EXPERIMENT
        #### Scenario 1
        self.prompt_per_table_1 = ChatPromptTemplate.from_template(
            """Role:
                You are an expert in ontology engineering and semantic data integration.

                Instructions:
                You are given a term and a list of candidate concepts. Your task is to select the most appropriate concept that matches the term.

                Context:
                The candidate concepts have been selected from a vector database using text embedding similarity. Each candidate has:
                - ID: Unique identifier
                - Label: Human-readable name
                - Description: Brief description
                - Explanatory_text: Detailed explanation
                - Synonyms: Alternative terms
                - Similarity: Cosine similarity score with the input term
                - Data Properties: List of data properties associated with the concept
                - Object Properties: List of object properties associated with the concept

                Term: {term}

                Candidates:
                {candidates_text}

                Analyze each candidate carefully and select the most appropriate one. Consider:
                1. Semantic similarity between the term and candidate labels
                2. Relevance of descriptions and explanatory text
                3. Presence of synonyms that match the term
                4. Overall conceptual alignment

                {format_instructions}

                Provide your selection with a confidence score (0.0 to 1.0) and clear reasoning."""
        )

        #### Scenario 2
        self.prompt_per_table_2 = ChatPromptTemplate.from_template(
            """
            Role:
                You are an expert in ontology engineering and semantic data integration.

            Instructions:
                You are given a database table (represented by a term and a list of candidate ontology concepts retrieved by embedding similarity) and must decide which ontology concept(s) best map to that table.

                Follow this structured process for each input:
                1. Quick overview:
                - Read the Term and Candidates.
                - Treat the vector-similarity score as a useful prior but validate it with descriptions, synonyms, explanatory_text, and property lists.

                2. Data-model signals (identify table structure and content):
                - Determine how many primary key(s) the table likely has. Use column names, common PK patterns, and multiplicity clues in descriptions to hypothesize primary key(s).
                - If multiple primary keys are present, note them explicitly and treat this as a signal that the table may map to multiple classes.
                - Detect mixed entity types: look for groups of columns that semantically point to different entity classes (e.g., customer fields vs. order fields). When mixed types are detected, state which entity types are present.

                3. Column clustering:
                - Group the table’s columns into semantic clusters by similarity (e.g., personal_info, address_info, transaction_info, product_info).
                - For each cluster, provide a short label and the columns in it.
                - For each cluster, propose the most suitable ontology class candidate(s) that match that cluster.

                4. Class-mapping logic:
                - A table may map to more than one ontology class. If so, explicitly explain which classes and why.
                - When mapping multiple classes, choose a single bridge column (or set of columns) that will serve as the relationship key between classes (e.g., customer_id, order_id). Explain why that column is an appropriate bridge.
                - If you conclude the table maps to a single class, explain why column clusters and PK analysis support a single-class mapping.

                5. Candidate analysis:
                - For each candidate concept provided, analyze:
                    • Label vs. Term semantic match
                    • Relevance of Description and Explanatory_text
                    • Matching Synonyms
                    • Data Properties and Object Properties alignment with table columns/clusters
                    • Cosine similarity score (use as a prior; explain if you override it)
                - Consider whether a candidate matches a whole table, matches one column cluster, or partially matches multiple clusters.

                6. Selection and output:
                - After completing the above analyses, select the most appropriate candidate concept(s).
                - Provide a confidence score (0.0 to 1.0) for each selected candidate.
                - Provide clear, concise reasons that reference your PK detection, column clusters, mixed-entity findings, and candidate property alignment.
                - If you mapped multiple classes, state the bridge column(s) to be used and why.
                - Provide columns associated with the term and selected candidate concept.

            Context:
                Each candidate has:
                - ID: Unique identifier
                - Label: Human-readable name
                - Description: Brief description
                - Explanatory_text: Detailed explanation
                - Synonyms: Alternative terms
                - Similarity: Cosine similarity score with the input term
                - Data Properties: List of data properties associated with the concept
                - Object Properties: List of object properties associated with the concept

            Input:
                Term: {term}
                Candidates:
                {candidates_text}

            Formatting rules:
                - Return strictly valid JSON that matches the schema above. Do not include additional commentary outside the JSON.
                - Inside the `reasons` entries, explicitly reference:
                    • Number and identity of inferred primary key(s)
                    • Column clusters (name + columns)
                    • Any detected mixed entity types
                    • Which column(s) you propose as bridge(s) (if mapping multiple classes)
                    • How each selected candidate aligns to clusters / PKs / properties / synonyms / similarity score
                - Confidence scores must be floats between 0.0 and 1.0 (two-decimal precision recommended, e.g., 0.85).
                - If no candidate is appropriate, return an empty `selected_candidates` list, an empty `confidence_scores` list, and provide a single reason explaining why none fit, including the PK/cluster analysis that supports this conclusion.

            {format_instructions}

            Be thorough, concise, and justify every selection with evidence from the candidates and the table structure.

            """
        )

        #### Scenario 3
        #### Add Global Schema Summary instructions
        self.prompt_per_table = ChatPromptTemplate.from_template(
            """
            Role:
                You are an expert in ontology engineering and semantic data integration.

            Goal:
                Your task is to map a single database table to one or more ontology classes.
                You must analyze this table in the context of the entire database schema and ontology,
                using both local (table-level) and global (schema-level) reasoning.

            Global Context:
                You are provided with a global schema summary that includes:
                - All tables in the data source, with their columns and relationships (PK/FK)
                - All ontology classes, with their data properties and object properties

            Input:
                Global_Schema_Summary: {global_schema_summary}
                Term: {term}
                Candidates: {candidates_text}
                Base_URI: {base_uri}

            Instructions:
                Use the following structured reasoning process:

                1. **Global Awareness & Contextualization**
                    - Study the Global_Schema_Summary first.
                    - Identify how the current table ({term}) connects to other tables (via PK/FK).
                    - Identify which ontology classes might already align with related tables.
                    - Use this context to maintain semantic and structural consistency with the global mapping logic.
                    - If the table references another table, consider how object properties in ontology express this relationship.

                2. **Quick Overview**
                    - Read the Term and Candidates carefully.
                    - Treat similarity scores as a useful prior, but validate using semantic and structural evidence.
                    - Note any global clues that help refine interpretation (e.g., FK links to another table already mapped to a specific ontology class).

                3. **Data-Model Signals**
                    - Infer likely primary key(s) and foreign key(s) using column patterns and the global schema.
                    - Explicitly mention detected PK(s) and FK(s) and how they indicate entity identity or relationships.
                    - If a table has multiple FKs or composite PKs, consider multi-entity mapping or join-table semantics.

                4. **Column Clustering**
                    - Group columns by semantic themes (e.g., personal_info, transaction_info, reference_info).
                    - Name each cluster and list its columns.
                    - Identify how these clusters correspond to ontology data or object properties.
                    - Use global schema information to validate whether similar clusters in other tables are mapped consistently.

                5. **Class-Mapping Logic**
                    - Decide whether the table maps to a single ontology class or multiple classes.
                    - If multiple, determine and justify the bridge columns (e.g., FK columns) connecting them.
                    - Explain how this bridging aligns with ontology object properties.
                    - Reference global schema context to maintain consistency: if related tables are mapped to certain classes, ensure logical alignment (e.g., “order” table mapped to `Order` → “customer_id” FK implies mapping to `Customer`).

                6. **Candidate Analysis**
                    For each candidate ontology class:
                        • Compare semantic match between label and table term.
                        • Evaluate how description, synonyms, and explanatory_text align with table purpose.
                        • Check data property alignment (column names ↔ ontology data properties).
                        • Check object property alignment (FKs ↔ ontology relationships).
                        • Consider cosine similarity but override it if semantic or structural alignment differs.
                        • Use the global schema to detect indirect signals — for example, if another table’s mapping implies a class relationship via object properties.

                7. **Global Consistency Check**
                    - Before final selection, ensure mappings are globally coherent:
                        • Do not map two related tables to ontology classes with incompatible relationships.
                        • If table A → class A, and this table references A, prefer mapping to a class related to A via ontology object properties.
                        • Maintain naming and relationship consistency across the entire schema.

                8. **Selection and Output**
                    - Select the most appropriate ontology class(es).
                    - For each selected candidate, provide:
                        • Confidence score (0.00–1.00, two decimals)
                        • Detailed reasoning with references to:
                            - PK/FK detection
                            - Column clusters
                            - Mixed-entity findings (if any)
                            - Bridge columns (if applicable)
                            - Global schema consistency
                            - Property alignment (data + object)
                            - Candidate analysis outcome
                        • Columns associated with the term and selected candidate concept.

                9. **Class URI Instruction (Base URI is provided)**
                    - You MUST output a recommended class URI for EACH selected ontology class.
                    - First, choose exactly ONE table column to act as that class's identifier (the "class ID column").
                      Prefer a true primary key for that entity/class. If multiple classes are selected, each class may use a different ID column.
                      If only composite keys exist, choose the single most stable/unique column and explain the limitation in the corresponding reason.
                    - Then construct the class URI using this exact format:
                        `<Base_URI>/<ClassLabel>/<class_id_column>`
                      where:
                        • `Base_URI` is exactly the provided Base_URI (do not invent one)
                        • `ClassLabel` is exactly the selected candidate label string you output
                        • `class_id_column` is exactly the chosen table column original name
                    - Do NOT output any other URI patterns.

                    - If no suitable class exists, return empty lists and justify using structural and semantic reasoning (e.g., “table acts as a join table only; no standalone class match”).

            Formatting rules:
                - Return strictly valid JSON that matches  {format_instructions}.
                - Do not include additional commentary outside the JSON.
                - Output must include `class_uris` aligned 1:1 with `selected_candidates`.
                - Example Output Structure:
                    If selecting 2 candidates for a table with columns [id, name, customer_id, order_date, amount]:
                    {{
                        "selected_candidates": ["Order", "Customer"],
                        "confidence_scores": [0.85, 0.75],
                        "reasons": ["Reason for Order mapping", "Reason for Customer mapping"],
                        "class_uris": [
                            "http://example.com/Order/id",
                            "http://example.com/Customer/customer_id"
                        ],
                        "columns": [
                            ["id", "order_date", "amount"],  // Columns for "Order" candidate
                            ["customer_id", "name"]          // Columns for "Customer" candidate
                        ],
                        "related_columns": [
                            ["customer_id"],  // Related columns for "Order" candidate
                            []                // Related columns for "Customer" candidate
                        ]
                    }}

            Be thorough, global-aware, and justify each decision using both local table evidence and global schema consistency.

            """
        )

        self.prompt_per_table_no_global = ChatPromptTemplate.from_template(
            """
            Role:
                You are an expert in ontology engineering and semantic data integration.

            Goal:
                Your task is to map a single database table to one or more ontology classes.
                ou must analyze the table using only the provided table-level information and candidate ontology descriptions, applying careful structural and semantic reasoning.

            Input:
                Term: {term}
                Candidates: {candidates_text}
                Base_URI: {base_uri}

            Instructions:
                Use the following structured reasoning process:

                1. **Quick Overview**
                    - Read the Term and Candidates carefully.
                    - Treat similarity scores as a useful prior, but validate using semantic and structural evidence.
                    - Note any global clues that help refine interpretation (e.g., FK links to another table already mapped to a specific ontology class).

                2. **Data-Model Signals**
                    - Infer likely primary key(s) and foreign key(s) using column patterns.
                    - Explicitly mention detected PK(s) and FK(s) and how they indicate entity identity or relationships.
                    - If a table has multiple FKs or composite PKs, consider multi-entity mapping or join-table semantics.

                3. **Column Clustering**
                    - Group columns by semantic themes (e.g., personal_info, transaction_info, reference_info).
                    - Name each cluster and list its columns.
                    - Identify how these clusters correspond to ontology data or object properties.

                4. **Class-Mapping Logic**
                    - Decide whether the table maps to a single ontology class or multiple classes.
                    - If multiple, determine and justify the bridge columns (e.g., FK columns) connecting them.
                    - Explain how this bridging aligns with ontology object properties.

                5. **Candidate Analysis**
                    For each candidate ontology class:
                        • Compare semantic match between label and table term.
                        • Evaluate how description, synonyms, and explanatory_text align with table purpose.
                        • Check data property alignment (column names ↔ ontology data properties).
                        • Check object property alignment (FKs ↔ ontology relationships).
                        • Consider cosine similarity but override it if semantic or structural alignment differs.

                6. **Global Consistency Check**
                    - Before final selection, ensure mappings are globally coherent:
                        • Do not map two related tables to ontology classes with incompatible relationships.
                        • If table A → class A, and this table references A, prefer mapping to a class related to A via ontology object properties.
                        • Maintain naming and relationship consistency across the entire schema.

                7. **Selection and Output**
                    - Select the most appropriate ontology class(es).
                    - For each selected candidate, provide:
                        • Confidence score (0.00–1.00, two decimals)
                        • Detailed reasoning with references to:
                            - PK/FK detection
                            - Column clusters
                            - Mixed-entity findings (if any)
                            - Bridge columns (if applicable)
                            - Property alignment (data + object)
                            - Candidate analysis outcome
                        • Columns associated with the term and selected candidate concept.

                8. **Class URI Instruction (Base URI is provided)**
                    - You MUST output a recommended class URI for EACH selected ontology class.
                    - First, choose exactly ONE table column to act as that class's identifier (the "class ID column").
                      Prefer a true primary key for that entity/class. If multiple classes are selected, each class may use a different ID column.
                      If only composite keys exist, choose the single most stable/unique column and explain the limitation in the corresponding reason.
                    - Then construct the class URI using this exact format:
                        `<Base_URI>/<ClassLabel>/<class_id_column>`
                      where:
                        • `Base_URI` is exactly the provided Base_URI (do not invent one)
                        • `ClassLabel` is exactly the selected candidate label string you output
                        • `class_id_column` is exactly the chosen table column original name
                    - Do NOT output any other URI patterns.

                    - If no suitable class exists, return empty lists and justify using structural and semantic reasoning (e.g., “table acts as a join table only; no standalone class match”).

            Formatting rules:
                - Return strictly valid JSON that matches  {format_instructions}.
                - Do not include additional commentary outside the JSON.
                - Output must include `class_uris` aligned 1:1 with `selected_candidates`.
                - Example Output Structure:
                    If selecting 2 candidates for a table with columns [id, name, customer_id, order_date, amount]:
                    {{
                        "selected_candidates": ["Order", "Customer"],
                        "confidence_scores": [0.85, 0.75],
                        "reasons": ["Reason for Order mapping", "Reason for Customer mapping"],
                        "class_uris": [
                            "http://example.com/Order/id",
                            "http://example.com/Customer/customer_id"
                        ],
                        "columns": [
                            ["id", "order_date", "amount"],  // Columns for "Order" candidate
                            ["customer_id", "name"]          // Columns for "Customer" candidate
                        ],
                        "related_columns": [
                            ["customer_id"],  // Related columns for "Order" candidate
                            []                // Related columns for "Customer" candidate
                        ]
                    }}

            Be thorough, global-aware, and justify each decision using both local table evidence and global schema consistency.

            """
        )

    def _setup_chains(self):
        """Setup LangChain chains"""
        self.row_chain = (
            self.prompt_per_row
            | self.llm
            | self.row_parser
        )

        """Change for ablation experiments - with or without global schema summary"""
        self.table_chain = (
            self.prompt_per_table_no_global
            | self.llm
            | self.table_parser
        )

    def _format_candidates(self, candidates: List[SimilarConcept]) -> str:
        """Format candidates for prompt"""
        candidates_text = []
        for i, candidate in enumerate(candidates, 1):
            candidate_text = f"""
                Candidate {i}:
                - ID: {candidate.id}
                - Label: {candidate.label}
                - Description: {candidate.description}
                - Explanatory Text: {candidate.explanatory_text}
                - Synonyms: {', '.join(candidate.synonyms) if candidate.synonyms else 'None'}
                - Similarity Score: {candidate.similarity:.4f}
                - Data Properties: {json.dumps(candidate.data_properties) if candidate.data_properties else 'None'}
                - Object Properties: {json.dumps(candidate.object_properties) if candidate.object_properties else 'None'}
                """
            candidates_text.append(candidate_text)

        return "\n".join(candidates_text)

    def select_concept_table(self, candidate: Candidate, global_schema_summary: str, provider: str = None, base_uri: str = "http://example.com/") -> Dict[str, Any]:
        """Select the best concept for a given term"""
        provider = provider or langchain_manager.config.LLM_PROVIDER
        model = self.config.LLM_MODEL
        langchain_manager.rate_limit_check(provider, embeddings=False)

        try:
            candidates_text = self._format_candidates(candidate.candidates)

            prompt_input = {
                "term": candidate.term,
                "candidates_text": candidates_text,
                "global_schema_summary": global_schema_summary,
                "base_uri": base_uri,
            }

            formatted_prompt = self.prompt_per_table_no_global.format_messages(
                **prompt_input,
                format_instructions=self.table_parser.get_format_instructions()
            )
            prompt_text = "\n".join([m.content for m in formatted_prompt])

            result = self.table_chain.invoke({
                **prompt_input,
                "format_instructions": self.table_parser.get_format_instructions()
            })

            log_entry = format_prompt_log(
                process_name="ConceptSelection - Table",
                step=1,
                total_steps=1,
                prompt_input=prompt_input,
                prompt_text=prompt_text,
                response=result,
                provider=provider,
                model=model,
                extra_info={"term": candidate.term, "candidate_count": len(candidate.candidates)}
            )
            append_prompt_log(self.prompt_log_file, log_entry)

            return {
                "term": candidate.term,
                "selected_candidate": result.selected_candidates,  # This is now a list
                "confidence_score": result.confidence_scores,      # This is now a list
                "reason": result.reasons,                          # This is now a list
                "class_uris": result.class_uris,                    # This is now a list
                "columns": result.columns,                         # List of lists
                "related_columns": result.related_columns          # List of lists
            }
        except Exception as e:
            print(f"Error selecting concept for term '{candidate.term}': {e}")
            return {
                "term": candidate.term,
                "selected_candidate": [],
                "confidence_score": [],
                "reason": [f"Error: {str(e)}"],
                "class_uris": [],
                "columns": [],      # Empty list of lists
                "related_columns": []  # Empty list of lists
            }

def llm_select_concepts_logic(selection_json: Dict[str, Any], selection_table_json: Dict[str, Any], global_schema_summary: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle LLM concept selection logic using LangChain - refactored version
    """

    # Initialize the selection chain
    selection_chain = ConceptSelectionChain()
    llm_selected_file = selection_chain.config.LLM_SELECTED_CONCEPTS_FILE or './data/llm_selected_concepts.txt'
    llm_selected_table_file = selection_chain.config.LLM_SELECTED_CONCEPTS_TABLE_FILE or './data/llm_selected_concepts_table.txt'
    llm_selected_log_file = selection_chain.config.LLM_SELECTED_CONCEPTS_LOG_FILE or './data/llm_selected_concepts_log.txt'

    # Initialize prompt log at start of process
    init_prompt_log(
        selection_chain.prompt_log_file,
        process_name="LLM Concept Selection",
        metadata={
            "Provider": selection_chain.config.LLM_PROVIDER,
            "Model": selection_chain.config.LLM_MODEL,
            "Total Candidates": len(selection_json) if selection_json else 0,
        }
    )

    # Extract parameters
    # Convert candidates_data to Candidate objects
    candidates = _convert_to_candidate_objects(selection_json)
    candidates_table = _convert_to_candidate_objects(selection_table_json) if selection_table_json else []

    if(selection_chain.config.SAVE_OUTPUT):
        # Check if both files exist and have content
        if (os.path.exists(llm_selected_table_file) and os.path.getsize(llm_selected_table_file) > 0 and
            os.path.exists(llm_selected_log_file) and os.path.getsize(llm_selected_log_file) > 0):

            print(f"Using existing LLM selected concepts from files")

            try:
                # with open(llm_selected_file, 'r') as f:
                #     file_content = f.read().strip()
                #     results = []
                #     for line in file_content.split('\n'):
                #         if line.strip():
                #             try:
                #                 result = eval(line.strip())
                #                 results.append(result)
                #             except:
                #                 pass

                with open(llm_selected_table_file, 'r') as f:
                    file_content_table = f.read().strip()
                    results_table = []
                    for line in file_content_table.split('\n'):
                        if line.strip():
                            try:
                                result = eval(line.strip())
                                results_table.append(result)
                            except:
                                pass

                with open(llm_selected_log_file, 'r') as log_file:
                    log = log_file.read()

                # Format the response
                # formatted_results = _format_selection_results(results, candidates)
                formatted_results_table = _format_selection_results_table(results_table, candidates_table) if selection_table_json else []

                return {
                    'message': 'Used existing LLM selected concepts from files',
                    'total_processed': len(results_table),
                    'log': log,
                    'results': [],
                    'results_table': formatted_results_table
                }

            except Exception as e:
                print(f"Error reading existing files: {e}. Proceeding with LLM processing.")

    # Process each candidate
    results = []
    results_table = []
    print(f"Processing {len(candidates)} candidates with LLM...")

    #### CHANGE IN THIS PART FOR EACH EXPERIMENT
    #candidate class from row
    # for i, candidate in enumerate(candidates, 1):
    #     print(f"Processing candidate {i} of {len(candidates)}: {candidate.term}")
    #     result = selection_chain.select_concept_row(candidate)
    #     results.append(result)

    #candidate class from table
    for i, candidate in enumerate(candidates_table, 1):
        print(f"Processing candidate {i} of {len(candidates_table)}: {candidate.term}")
        result = selection_chain.select_concept_table(candidate, global_schema_summary)
        results_table.append(result)

    # Generate log using appropriate functions
    log = ""
    if results:
        log = _generate_selection_log(results)
    if results_table:
        if log:
            log += "\n\nTable Candidates Selection Log:\n"
        log += _generate_selection_log_table(results_table)

    # Save results to files
    # with open(llm_selected_file, 'w') as f:
    #     for result in results:
    #         f.write(f"{result}\n")

    with open(llm_selected_table_file, 'w') as f:
        for result in results_table:
            f.write(f"{result}\n")

    with open(llm_selected_log_file, 'w') as log_file:
        log_file.write(log)

    # Format the response
    formatted_results = _format_selection_results(results, candidates) if results else []
    formatted_results_table = _format_selection_results_table(results_table, candidates_table)

    return {
        'message': 'LLM concept selection completed successfully',
        'total_processed': len(candidates_table),
        'log': log,
        'results': formatted_results,
        'results_table': formatted_results_table
    }

def _convert_to_candidate_objects(candidates_data: List[Dict]) -> List[Candidate]:
    """Convert JSON data to Candidate objects"""
    candidates = []

    for candidate_item in candidates_data:
        similar_concepts = []
        for concept_data in candidate_item.get('candidates', []):
            similar_concept = SimilarConcept(
                id=concept_data.get('id', ''),
                label=concept_data.get('label', ''),
                description=concept_data.get('description', ''),
                explanatory_text=concept_data.get('explanatory_text', ''),
                synonyms=concept_data.get('synonyms', []),
                similarity=float(concept_data.get('similarity', 0.0)),
                data_properties=concept_data.get('data_properties', []),
                object_properties=concept_data.get('object_properties', [])
            )
            similar_concepts.append(similar_concept)

        candidate = Candidate(
            term=candidate_item.get('term', ''),
            candidates=similar_concepts
        )
        candidates.append(candidate)

    return candidates

def _generate_selection_log(results: List[Dict]) -> str:
    """Generate log from selection results"""
    log = ''
    for i, result in enumerate(results):
        if i > 0:
            log += "\n"
        log += f"Term: {result['term']}\n"
        log += f"  Selected Candidate: {result['selected_candidate']} | Confidence: {result['confidence_score']:.4f}\n"
        log += f"  Reason: {result['reason']}\n"

    return log

def _format_selection_results(results: List[Dict], candidates_data: List[Dict]) -> List[Dict]:
    """Format selection results with URIs"""
    formatted_results = []
    for result in results:
        selected_candidate_uri = ''
        term = result.get('term', '')
        selected_candidate = result.get('selected_candidate', '')

        # Find the corresponding URI
        for candidate_item in candidates_data:
            if candidate_item.term == term:
                for concept_data in candidate_item.candidates:
                    concept_label = concept_data.label
                    if concept_label == selected_candidate:
                        selected_candidate_uri = concept_data.id
                        break
                break

        formatted_results.append({
            'term': result.get('term', ''),
            'selected_candidate': result.get('selected_candidate', ''),
            'selected_candidate_URI': selected_candidate_uri,
            'confidence_score': result.get('confidence_score', 0.0),
            'reason': result.get('reason', '')
        })

    return formatted_results

def _format_selection_results_table(results: List[Dict], candidates_data: List[Dict]) -> List[Dict]:
    """Format selection results with URIs for table-level concept selection"""
    formatted_results = []

    for result in results:
        term = result.get('term', '')
        selected_candidates = result.get('selected_candidate', [])
        confidence_scores = result.get('confidence_score', [])
        reasons = result.get('reason', [])
        class_uris = result.get('class_uris', [])
        columns = result.get('columns', [])  # Now a list of lists
        related_columns = result.get('related_columns', [])  # Now a list of lists

        # Handle the case where selected_candidate might be a single value or list
        if not isinstance(selected_candidates, list):
            selected_candidates = [selected_candidates] if selected_candidates else []
        if not isinstance(confidence_scores, list):
            confidence_scores = [confidence_scores] if confidence_scores is not None else []
        if not isinstance(reasons, list):
            reasons = [reasons] if reasons else []

        # Handle columns - ensure it's a list of lists
        if columns and not isinstance(columns[0], list) if columns else False:
            # If columns is a flat list, wrap it as a single candidate's columns
            columns = [columns]

        # Handle related_columns - ensure it's a list of lists
        if related_columns and not isinstance(related_columns[0], list) if related_columns else False:
            # If related_columns is a flat list, wrap it as a single candidate's related columns
            related_columns = [related_columns]

        # Find corresponding URIs for each selected candidate
        selected_candidate_uris = []
        for selected_candidate in selected_candidates:
            selected_candidate_uri = ''

            # Find the corresponding URI
            for candidate_item in candidates_data:
                if candidate_item.term == term:
                    for concept_data in candidate_item.candidates:
                        concept_label = concept_data.label
                        if concept_label == selected_candidate:
                            selected_candidate_uri = concept_data.id
                            break
                    if selected_candidate_uri:
                        break

            selected_candidate_uris.append(selected_candidate_uri)

        # Create formatted result with nested lists
        formatted_result = {
            'term': term,
            'selected_candidates': selected_candidates,
            'selected_candidate_URIs': class_uris,
            'confidence_scores': confidence_scores,
            'class_uris': class_uris,
            'reasons': reasons,
            'columns': columns,  # List of lists
            'related_columns': related_columns  # List of lists
        }

        formatted_results.append(formatted_result)

    return formatted_results

def _generate_selection_log_table(results: List[Dict]) -> str:
    """Generate log from table-level selection results"""
    log = ''
    for i, result in enumerate(results):
        if i > 0:
            log += "\n"

        term = result.get('term', '')
        selected_candidates = result.get('selected_candidate', [])
        confidence_scores = result.get('confidence_score', [])
        reasons = result.get('reason', [])
        class_uris = result.get('class_uris', [])
        columns = result.get('columns', [])
        related_columns = result.get('related_columns', [])

        # Handle single values vs lists
        if not isinstance(selected_candidates, list):
            selected_candidates = [selected_candidates] if selected_candidates else []
        if not isinstance(confidence_scores, list):
            confidence_scores = [confidence_scores] if confidence_scores is not None else []
        if not isinstance(reasons, list):
            reasons = [reasons] if reasons else []

        # Handle columns - ensure it's a list of lists
        if columns and not isinstance(columns[0], list) if columns else False:
            columns = [columns]

        # Handle related_columns - ensure it's a list of lists
        if related_columns and not isinstance(related_columns[0], list) if related_columns else False:
            related_columns = [related_columns]

        log += f"Term: {term}\n"

        if selected_candidates:
            for j, (candidate, confidence, reason) in enumerate(zip(selected_candidates, confidence_scores, reasons)):
                log += f"\n  Selected Candidate {j+1}: {candidate} | Confidence: {confidence:.4f}\n"
                log += f"  Reason {j+1}: {reason}\n"
                log += f"  Class URI {j+1}: {class_uris[j] if j < len(class_uris) else 'N/A'}\n"

                # Add columns for this candidate
                if j < len(columns) and columns[j]:
                    log += f"  Columns for Candidate {j+1}: {', '.join(columns[j])}\n"

                # Add related columns for this candidate
                if j < len(related_columns) and related_columns[j]:
                    log += f"  Related Columns for Candidate {j+1}: {', '.join(related_columns[j])}\n"
        else:
            log += "  No candidates selected\n"

    return log
