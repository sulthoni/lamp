"""
Module for suggesting and selecting properties using LangChain.
"""
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_config import langchain_manager
from interface import CandidateProperties, DataProperties, ObjectProperties, Column, PropertyMappingList
from prompt_logger import format_prompt_log, append_prompt_log, init_prompt_log
import os
import json
import time
from collections import deque

class PropertySelectionChain:
    def __init__(self):
        self.llm = langchain_manager.get_llm()
        self.config = langchain_manager.config
        self.parser = PydanticOutputParser(pydantic_object=PropertyMappingList)
        self._setup_prompt()
        self._setup_chain()
        self.request_times = deque()

        # Prompt log file — per-table log is set dynamically in suggest_properties
        self.prompt_log_file = getattr(self.config, 'PROMPT_LOG_PROPERTIES_FILE', './data/prompt_log_properties.txt')

    #### CHANGE IN THIS PART FOR EACH EXPERIMENT
    def _setup_prompt(self):
        """Setup prompt template"""
        # version 1
        self.prompt_1 = ChatPromptTemplate.from_template(
            """You are an expert in ontology engineering and database schema mapping.

                Your task is to map each database column to the most relevant data property or object property from the provided ontology.

                Rules:
                1. Use both column_name and improved_column_name to understand the column's meaning
                2. Map to either dataProperties.name or objectProperties.name
                3. Skip mapping if the column is the table's primary key/identity
                4. Only map if you're confident; otherwise suggest the closest property
                5. Every non-identity column must be mapped
                6. Set new_property=true if no suitable existing property exists
                7. Set type="data" for data properties, type="object" for object properties

                Table Information:
                - Table: {table_name} (improved: {improved_table_name})
                - Suggested Class: {suggested_class}
                - Additional Context: {term} - {reason}

                Columns to map:
                {columns_text}

                Available Data Properties:
                {data_properties_text}

                Available Object Properties:
                {object_properties_text}

                {format_instructions}

                Provide mappings for all non-identity columns."""
        )
        # version 2
        self.prompt_2 = ChatPromptTemplate.from_template(
            """
            Role:
                You are an expert in ontology engineering and database-to-ontology schema mapping.

            Task:
                Your job is to map each database column to the most relevant **data property** or **object property** from the provided ontology.

            Overall Objective:
                Produce accurate, semantically consistent column-to-property mappings that reflect both the structural and semantic relationships in the database table.

            ---

            ### Mapping Principles

            1. **Dual Input Understanding**
            - Use both `column_name` and `improved_column_name` to interpret the column meaning.
            - Prioritize semantic meaning over surface similarity.

            2. **Property Selection**
            - Map each column to either:
                - `dataProperties.name` (for intrinsic attributes, e.g., name, date, amount)
                - `objectProperties.name` (for relational or reference columns, e.g., author_id, product_ref)
            - If no suitable property exists, propose a new one and set `new_property=true`.

            3. **Primary Key Handling**
            - if a primary key also functions as a **foreign key** (e.g., in join tables), treat it accordingly under object property rules.

            4. **Confidence & Suggestions**
            - Only commit to a mapping when confident.
            - If uncertain, select the closest possible property and explain your reasoning.

            5. **Completeness**
            - Every non-identity column must have a mapping (either existing or proposed).

            6. **Type Annotation**
            - Use `type="data"` for data properties.
            - Use `type="object"` for object properties.

            ---

            ### Object Properties Detection and Linking to Related Classes

            1. **Foreign Key Identification**
            - Analyze the table columns to detect foreign keys (FKs).
            - Typical FK naming patterns include: `*_id`, `*_ref`, `*_number`, etc.
            - A column not semantically aligned with the table’s main class or name may be a FK.

            2. **Join Tables and Composite Keys**
            - If the table has multiple primary keys or functions as a join/association table, it likely connects multiple classes.
            - Identify the columns serving as foreign keys linking to those classes.

            3. **Class Relationship Validation**
            - For each potential object property, check that the linked classes have a **logical and meaningful** semantic relationship.
            - Example: `customer_id` → `hasCustomer` is valid; `price_id` → `hasCustomer` is not.

            4. **Dual Mapping Columns**
            - When a table maps to multiple classes, one or more columns may serve as **bridges**.
            - Such columns may be mapped twice:
                - once as an **object property** (link to another class)
                - once as a **class property** (attribute in the local class)

            ---

            ### Data Properties Detection

            1. **Identify Data Properties**
            - Mark intrinsic, descriptive columns as data properties (e.g., `name`, `age`, `amount`, `date_created`).
            - Focus on columns semantically related to the table’s main class.

            2. **Class Grouping for Multi-Class Tables**
            - If the table maps to multiple classes:
                - Group columns by semantic similarity (e.g., customer_info, transaction_info).
                - Within each group, map columns to the corresponding class properties.
                - Avoid overlapping mappings across classes.

            3. **Iterative Confidence**
            - Reevaluate until all columns are confidently mapped and consistent.
            - Ensure each mapping fits cleanly within its class context (e.g., no attribute of a person is mapped to an order).

            ---

            ### Input Context

            - **Table:** {table_name}
            - **Improved Table Name:** {improved_table_name}
            - **Suggested Class:** {suggested_class}
            - **Additional Context from mapping table to class step:** {term} — {reason}

            **Columns to Map:**
            {columns_text}

            **Improved Column Names:**
            {improved_columns_text}

            **Suggested Columns to Map (Suggestion from previous steps):**
            {suggested_columns_text}

            **Related Columns (linking to other concepts. Suggestion from previous steps):**
            {related_columns_text}

            **Available Data Properties:**
            {data_properties_text}

            **Available Object Properties:**
            {object_properties_text}

            ---

            ### Output Format

            Follow these output formatting rules exactly:

            {format_instructions}

            Each mapped column must include:
            - the selected property label (`data` or `object`)
            - `type` field (`data` or `object`)
            - `new_property` flag (true/false)
            - a short, clear explanation justifying your choice (based on semantics, FK detection, or clustering)
            - reference to any related class if `type="object"`

            ---

            ### Final Instructions

            - Provide mappings for **all columns**.
            - Ensure that the reasoning reflects:
                - FK and PK analysis
                - Semantic matching between columns and ontology properties
                - Multi-class grouping and link columns (if any)
                - Confidence in selection
                - Return structured output **only**, following the exact JSON schema specified by `{format_instructions}`.
            """
        )
        # version 3
        self.prompt = ChatPromptTemplate.from_template(
            """
            Role:
                You are an expert in ontology engineering and ontology-based data integration (OBDI).
                You specialize in schema alignment between relational data sources and ontology classes.

            Task:
                Your job is to map each database column to the most semantically relevant **data property** or **object property**
                from the provided ontology.
                You must consider both local table context and the global schema-level relationships
                to ensure globally consistent, complete, and non-redundant mappings.

            ---

            ### Input Context
                **Global_Schema_Summary:**
                {global_schema_summary}

                **Table:** {table_name}

                **Improved Table Name:** {improved_table_name}

                **Columns:**
                {columns_text}

                **Additional Context of table:**
                {term}

                **Total Classes Suggested for This Table:**
                {suggested_classes_count}

                **Suggested Classes:**
                {suggested_classes_from_first_step}

                **Suggested Classes IRI:**
                {suggested_classes_iri_from_first_step}

                **Suggested Columns for Each Class (from step 1):**
                {suggested_columns_text}

                **Available Data Properties:**
                {data_properties_text}

                **Available Object Properties:**
                {object_properties_text}

                **Related Columns (cross-table relationships):**
                {related_columns_text}

            ---

            ### 1. Global Context Awareness

            You are provided with a **Global Schema Summary** that contains:
            - All database tables, their columns, and PK/FK relationships.
            - All ontology classes, their data properties and object properties.
            - Previously mapped columns and their associated ontology properties (from earlier iterations).

            Use this summary to maintain global consistency, detect overlaps, and ensure full mapping coverage.

            Example format:
            {{
                "tables": {{
                    "author": ["author_id (PK)", "name", "email"],
                    "book": ["book_id (PK)", "title", "author_id (FK -> author)"]
                }},
                "ontology": {{
                    "Author": ["name", "email", "hasWritten -> Book"],
                    "Book": ["title", "writtenBy -> Author"]
                }},
                "previous_mappings": [{{
                    "author": {{
                        "author.name": "Author.name",
                        "author.email": "Author.email"
                    }},
                    "book": {{
                        "book.title": "Book.title",
                        "book.author_id": "Book.writtenBy -> Author"
                    }}]
                }}
            }}

            ---

            ### 2. Mapping Principles

            1. **Dual Input Understanding**
                - Interpret each column using both `column_name` and `improved_column_name`.
                - Consider how the column semantically fits into the global schema and ontology.

            2. **Global Awareness**
                - Review the `Global_Schema_Summary` to see:
                    - How this table connects to others (PK/FK relations).
                    - Which ontology classes are already aligned with related tables.
                    - Which properties have been mapped already to prevent duplication.
                - Avoid re-mapping columns already covered in previous steps, unless justified by semantic overlap.

            3. **Multi-Class Targeting**
                - Although columns originate from one table, they may map to properties in multiple ontology classes.
                - Use `suggested_columns_for_each_class` from step 1 as context for assigning columns to classes.
                - Explain clearly which class each property belongs to and why.

            4. **Property Selection**
                - Map each column to **either**:
                    - a `data property` (for intrinsic attributes)
                    - an `object property` (for relational or reference columns)
                - If no suitable property exists, propose a new one with `new_property = true`.
                - Only map when there is clear semantic correlation — do **not** force weak mappings.

            5. **Composite / Combined Columns**
                - If a property logically represents a combination of columns (e.g., `fullname` = `firstName` + `lastName`),
                explicitly identify the columns involved and justify the composition.
                - Composite mappings should be semantically meaningful and well-aligned with the ontology.

            6. **Reusing Columns**
                - A single column may participate in multiple mappings if semantically justified
                (e.g., `author_id` → `hasAuthor` and also used as part of `createdBy` if conceptually valid).

            ---

            ### 3. Mapping Logic Details

            #### A. Foreign Keys and Object Properties
            - Detect FKs based on naming patterns (`*_id`, `*_ref`, `*_code`, etc.) and `Global_Schema_Summary` links.
            - For each potential object property:
            - Check if the **domain and range** align semantically with the related ontology classes.
            - Use related columns (suggested in step 1) to confirm possible two-way mapping.
            - Consider both directions:
                - Column → object property
                - Object property → potential column(s)
            - If both make sense, confirm with evidence (naming, semantic meaning, and ontology relationships).
            - Validate that domain–range class relationships are consistent with the ontology (e.g., if `Book` → `Author`, then `book.author_id` → `writtenBy`).

            #### B. Data Properties
            - Map intrinsic columns (e.g., `name`, `date`, `amount`) to ontology data properties belonging to the most relevant class.
            - For tables mapped to multiple classes, group columns by semantic class context.
            - Avoid cross-class confusion (e.g., “customer_email” should not map to an order-level property).
            - Validate that the mapping does not duplicate existing property mappings from `previous_mappings`.

            ---

            ### 4. Completeness and Global Validation

            1. Ensure every column (except PK-only identity columns) has a mapping to either a property or a newly proposed property.
            2. Compare your mappings against `previous_mapping_summary` to avoid duplication.
            3. Check total number of mappings equals the `expected_column_count`.
            4. Validate that:
            - Each mapping is globally consistent.
            - Relationships between tables (via FKs) align with ontology object properties.
            - No conflicting or circular mappings exist.
            - Cross-class mappings maintain ontology domain-range correctness.

            If any column cannot be mapped meaningfully, include it in the result with `"mapped": false` and a reason.

            ---

            ### 5. Output Format

            Follow these output formatting rules exactly:

            {format_instructions}

            ---

            ### 6. Final Instructions

            - Ensure reasoning references:
                - FK and PK analysis
                - Suggested classes and columns from step 1
                - Domain–range semantic correlation for object properties
                - Composite mappings where applicable
                - Global schema and previous mappings for consistency
            - Only include valid JSON output, following `{format_instructions}`.
            - Be globally coherent, semantically precise, and avoid over-mapping.


            """
        )

    def _setup_chain(self):
        """Setup LangChain chain"""
        self.chain = (
            self.prompt
            | self.llm
            | self.parser
        )

    def _format_list_to_string(self, list: List[str], name: str) -> str:
        """Format columns for prompt"""
        texts = []
        for i, item in enumerate(list, 1):
            text = f"{i}. {name}: {item}"
            texts.append(text)

        return "\n".join(texts)

    def _format_double_list_to_string(self, double_list: List[List[str]], block: List[str], block_name: str, name: str) -> str:
        """Format columns for prompt"""
        texts = []
        for idx, group in enumerate(double_list):
            texts.append(f"{block_name} - {block[idx]}:")
            for i, item in enumerate(group, 1):
                texts.append(f"{i}. {name}: {item}")
            texts.append("\n")  # Add a newline after each group

        return "\n".join(texts)

    def _format_columns(self, columns: List[Column]) -> str:
        """Format columns for prompt"""
        columns_text = []
        for i, column in enumerate(columns, 1):
            column_text = f"{i}. Column: {column.column_name} (improved: {column.improved_column_name})"
            columns_text.append(column_text)

        return "\n".join(columns_text)

    def _format_data_properties(self, data_properties: List[List[DataProperties]], class_names: List[str] = None) -> str:
        """Format data properties for prompt - handles nested list structure for multiple classes"""
        if not data_properties:
            return "None available"

        # Build formatted text for each class's data properties
        formatted_sections = []

        for class_idx, prop_group in enumerate(data_properties):
            # Get class name if available
            class_label = class_names[class_idx] if class_names and class_idx < len(class_names) else f"Class {class_idx + 1}"

            if not prop_group:
                formatted_sections.append(f"{class_label}: No data properties available")
                continue

            # Format properties for this class
            props_for_class = []
            for i, prop in enumerate(prop_group, 1):
                prop_text = f"  {i}. {prop.name} (Type: {prop.dataType}, URI: {prop.uriDataType})"
                props_for_class.append(prop_text)

            # Combine into a class section
            class_section = f"{class_label} - Data Properties:\n" + "\n".join(props_for_class)
            formatted_sections.append(class_section)

        return "\n\n".join(formatted_sections)

    def _format_object_properties(self, object_properties: List[List[ObjectProperties]], class_names: List[str] = None) -> str:
        """Format object properties for prompt - handles nested list structure for multiple classes"""
        if not object_properties:
            return "None available"

        # Build formatted text for each class's object properties
        formatted_sections = []

        for class_idx, prop_group in enumerate(object_properties):
            # Get class name if available
            class_label = class_names[class_idx] if class_names and class_idx < len(class_names) else f"Class {class_idx + 1}"

            if not prop_group:
                formatted_sections.append(f"{class_label}: No object properties available")
                continue

            # Format properties for this class
            props_for_class = []
            for i, prop in enumerate(prop_group, 1):
                prop_text = f"  {i}. {prop.name} (Domain: {prop.domain} [{prop.uriDomain}], Range: {prop.range} [{prop.uriRange}])"
                props_for_class.append(prop_text)

            # Combine into a class section
            class_section = f"{class_label} - Object Properties:\n" + "\n".join(props_for_class)
            formatted_sections.append(class_section)

        return "\n\n".join(formatted_sections)

    def suggest_properties(self, candidate_properties: CandidateProperties, global_schema_summary: str, provider: str = None) -> List[Dict[str, Any]]:
        """Suggest property mappings for columns"""
        provider = provider or langchain_manager.config.LLM_PROVIDER
        model = self.config.LLM_MODEL
        langchain_manager.rate_limit_check(provider, embeddings=False)

        try:
            columns_text = self._format_columns(candidate_properties.columns)
            data_properties_text = self._format_data_properties(candidate_properties.data_properties, candidate_properties.suggestedClass)
            object_properties_text = self._format_object_properties(candidate_properties.object_properties, candidate_properties.suggestedClass)
            suggested_class_text = self._format_list_to_string(candidate_properties.suggestedClass, "Class")
            suggested_class_iri_text = self._format_list_to_string(candidate_properties.suggestedClassIRI, "Class IRI")
            suggested_columns_text = self._format_double_list_to_string(candidate_properties.suggestedColumns, candidate_properties.suggestedClass, "Suggested Columns for Class", "Column")
            related_columns_text = self._format_double_list_to_string(candidate_properties.related_columns, candidate_properties.suggestedClass, "Related Columns for Class", "Column")

            prompt_input = {
                "global_schema_summary": global_schema_summary,
                "table_name": candidate_properties.table_name,
                "improved_table_name": candidate_properties.improved_table_name,
                "columns_text": columns_text,
                "term": candidate_properties.term,
                "suggested_classes_count": candidate_properties.total_candidates,
                "suggested_classes_from_first_step": suggested_class_text,
                "suggested_classes_iri_from_first_step": suggested_class_iri_text,
                "suggested_columns_text": suggested_columns_text,
                "data_properties_text": data_properties_text,
                "object_properties_text": object_properties_text,
                "related_columns_text": related_columns_text,
                "format_instructions": self.parser.get_format_instructions(),
            }

            # Render full prompt before invoking
            formatted_prompt = self.prompt.format_messages(**prompt_input)
            prompt_text = "\n".join([m.content for m in formatted_prompt])

            result = self.chain.invoke(prompt_input)

            # Log the prompt and response — use per-table log file
            log_file = f'./data/prompt_log_properties_{candidate_properties.table_name}.txt'
            log_entry = format_prompt_log(
                process_name=f"PropertySuggestion - {candidate_properties.table_name}",
                step=1,
                total_steps=1,
                prompt_input={k: v for k, v in prompt_input.items() if k != "format_instructions"},
                prompt_text=prompt_text,
                response=result,
                provider=provider,
                model=model,
                extra_info={
                    "table_name": candidate_properties.table_name,
                    "column_count": len(candidate_properties.columns),
                    "suggested_classes": candidate_properties.suggestedClass,
                }
            )
            append_prompt_log(log_file, log_entry)

            # Convert to list of dictionaries
            return [
                {
                    "table_name": candidate_properties.table_name,
                    "column_name": mapping.column_name,
                    "class_name": mapping.class_name,
                    "properties": mapping.properties,
                    "type": mapping.type,
                    "new_property": mapping.new_property
                }
                for mapping in result.mappings
            ]
        except Exception as e:
            print(f"Error suggesting properties: {e}")
            # Fallback to empty mappings
            return [
                {
                    "table_name": candidate_properties.table_name,
                    "column_name": col.column_name,
                    "class_name": None,
                    "properties": None,
                    "type": None,
                    "new_property": None
                }
                for col in candidate_properties.columns
            ]

def llm_suggest_properties_logic(properties_json: Dict[str, Any], global_schema_summary: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle LLM properties suggestion logic using LangChain - refactored version
    """

    # Initialize the property selection chain
    property_chain = PropertySelectionChain()
    provider = property_chain.config.LLM_PROVIDER
    model = property_chain.config.LLM_MODEL

    # Extract parameters
    table_names = properties_json.get('table_name')
    candidate_properties_data = properties_json.get('properties')

    if not table_names:
        return {'error': 'table_name is required and cannot be empty.'}

    llm_properties_file = f'./data/llm_suggested_properties_{table_names}.txt'
    llm_properties_log_file = f'./data/llm_suggested_properties_log_{table_names}.txt'
    prompt_log_file = f'./data/prompt_log_properties_{table_names}.txt'

    # Initialize prompt log at start of process
    init_prompt_log(
        prompt_log_file,
        process_name=f"Property Suggestion - {table_names}",
        metadata={
            "Provider": provider,
            "Model": model,
            "Table": table_names,
        }
    )

    # Check if both files exist and have content
    if (os.path.exists(llm_properties_file) and os.path.getsize(llm_properties_file) > 0 and
        os.path.exists(llm_properties_log_file) and os.path.getsize(llm_properties_log_file) > 0):

        print(f"Using existing LLM suggested properties from files")

        try:
            with open(llm_properties_file, 'r') as f:
                file_content = f.read().strip()
                results = []
                for line in file_content.split('\n'):
                    if line.strip():
                        try:
                            result = eval(line.strip())
                            results.append(result)
                        except:
                            pass

            with open(llm_properties_log_file, 'r') as log_file:
                log = log_file.read()

            # Update global schema summary with existing results
            global_schema_summary = _update_global_schema_with_mappings(global_schema_summary, results)

            return {
                'message': 'Used existing LLM suggested properties from files',
                'success': True,
                'log': log,
                'results': results,
                'global_schema_summary': global_schema_summary
            }

        except Exception as e:
            print(f"Error reading existing files: {e}. Proceeding with LLM properties suggestion.")
            return {'message': 'Error reading existing files. Proceeding with LLM properties suggestion.', 'success': False}

    # Convert candidate_properties_data to CandidateProperties object
    candidate_properties = _convert_to_candidate_properties(candidate_properties_data)

    # Convert global_schema_summary to string for prompt
    global_schema_summary_str = json.dumps(global_schema_summary, indent=2)

    # Process properties suggestion
    print(f"Processing properties suggestion with {provider}")
    results = property_chain.suggest_properties(candidate_properties, global_schema_summary_str, provider)

    # Update global schema summary with new mappings
    global_schema_summary = _update_global_schema_with_mappings(global_schema_summary, results)

    # Create log for results
    log = _generate_properties_log(results)

    # Save results to files
    with open(llm_properties_file, 'w') as f:
        for item in results:
            f.write(f"{item}\n")

    with open(llm_properties_log_file, 'w') as log_file:
        log_file.write(log)

    return {
        'message': 'LLM properties suggestion completed successfully',
        'success': True,
        'log': log,
        'results': results,
        'global_schema_summary': global_schema_summary
    }

def _convert_to_candidate_properties(candidate_properties_data: List[Dict[str, Any]]) -> CandidateProperties:
    """
    Convert JSON data array to CandidateProperties object.
    Handles multiple class mappings for a single table.

    Args:
        candidate_properties_data: Array of candidate property dictionaries

    Returns:
        CandidateProperties object with table-level and class-level data
    """

    if not candidate_properties_data or len(candidate_properties_data) == 0:
        raise ValueError("candidate_properties_data cannot be empty")

    # Get table-level data from first item (same across all candidates)
    first_item = candidate_properties_data[0]

    term = first_item.get('term', '')
    table_name = first_item.get('table_name', '')
    improved_table_name = first_item.get('improved_table_name', '')
    total_candidates = first_item.get('total_candidates', len(candidate_properties_data))

    # Extract columns from first item (same for all candidates)
    columns = []
    columns_data = first_item.get('columns', [])

    # Handle different column formats
    if isinstance(columns_data, list):
        if columns_data and isinstance(columns_data[0], dict):
            # Format: [{"column_name": "...", "improved_column_name": "..."}, ...]
            for col_data in columns_data:
                column = Column(
                    column_name=col_data.get('column_name', ''),
                    improved_column_name=col_data.get('improved_column_name', '')
                )
                columns.append(column)
        elif columns_data and isinstance(columns_data[0], str):
            # Format: ["col1", "col2", ...]
            # Need to get improved names from somewhere
            improved_cols = first_item.get('improved_column_names', columns_data)
            for i, col_name in enumerate(columns_data):
                improved_name = improved_cols[i] if i < len(improved_cols) else col_name
                column = Column(
                    column_name=col_name,
                    improved_column_name=improved_name
                )
                columns.append(column)

    # Initialize class-level arrays
    suggestedClass = []
    suggestedClassIRI = []
    data_properties_list = []
    object_properties_list = []
    suggestedColumns_list = []
    related_columns_list = []
    reason_list = []
    confidence_scores_list = []
    selected_list = []

    # Process each candidate (class mapping)
    for item in candidate_properties_data:
        # Extract class information
        suggestedClass.append(item.get('suggestedClass', ''))
        suggestedClassIRI.append(item.get('suggestedClassIRI', ''))
        reason_list.append(item.get('reason', ''))
        confidence_scores_list.append(item.get('confidence_score', 0.0))
        selected_list.append(item.get('selected', False))

        # Extract data properties for this class
        data_properties = []
        for dp_data in item.get('dataProperties', []):
            data_property = DataProperties(
                name=dp_data.get('name', ''),
                dataType=dp_data.get('dataType', ''),
                uriDataType=dp_data.get('uriDataType', '')
            )
            data_properties.append(data_property)
        data_properties_list.append(data_properties)

        # Extract object properties for this class
        object_properties = []
        for op_data in item.get('objectProperties', []):
            object_property = ObjectProperties(
                name=op_data.get('name', ''),
                domain=op_data.get('domain', ''),
                uriDomain=op_data.get('uriDomain', ''),
                range=op_data.get('range', ''),
                uriRange=op_data.get('uriRange', '')
            )
            object_properties.append(object_property)
        object_properties_list.append(object_properties)

        # Extract suggested columns for this class
        suggested_cols = item.get('suggestedColumns', [])
        if isinstance(suggested_cols, list):
            suggestedColumns_list.append(suggested_cols)
        else:
            suggestedColumns_list.append([])

        # Extract related columns for this class
        related_cols = item.get('related_columns', [])
        if isinstance(related_cols, list):
            related_columns_list.append(related_cols)
        else:
            related_columns_list.append([])

    # Create and return CandidateProperties object
    return CandidateProperties(
        term=term,
        table_name=table_name,
        improved_table_name='',
        columns=columns,
        total_candidates=total_candidates,
        suggestedClass=suggestedClass,
        suggestedClassIRI=suggestedClassIRI,
        data_properties=data_properties_list,
        object_properties=object_properties_list,
        suggestedColumns='',
        related_columns='',
        reason='',
    )

def _generate_properties_log(result: List[Dict]) -> str:
    """Generate log from properties suggestion results"""
    log = f"Properties Suggestion Results:\n"
    log += f"Total columns processed: {len(result)}\n\n"

    for i, item in enumerate(result, 1):
        log += f"Column {i}:\n"
        log += f"  Table Name: {item.get('table_name', 'N/A')}\n"
        log += f"  Column Name: {item.get('column_name', 'N/A')}\n"
        log += f"  Class: {item.get('class_name', 'N/A')}\n"
        log += f"  Properties: {item.get('properties', 'N/A')}\n"
        log += f"  Type: {item.get('type', 'N/A')}\n"
        log += f"  New Property: {item.get('new_property', 'N/A')}\n\n"

    return log

def _format_previous_mappings_from_results(results: List[Dict]) -> Dict[str, Dict[str, str]]:
    """
    Convert property mapping results into the previous_mappings format.

    Args:
        results: List of property mapping results

    Returns:
        Dictionary with table names as keys and column-to-property mappings as values
    """
    mappings_by_table = {}

    for result in results:
        table_name = result.get('table_name', '')
        column_name = result.get('column_name', '')
        class_name = result.get('class_name', '')
        properties = result.get('properties', '')
        prop_type = result.get('type', '')

        if not all([table_name, column_name, class_name, properties]):
            continue

        # Initialize table entry if not exists
        if table_name not in mappings_by_table:
            mappings_by_table[table_name] = {}

        # Format the mapping based on property type
        column_key = f"{table_name}.{column_name}"

        if prop_type == 'object':
            # Object property format: "table.column": "Class.property -> RangeClass"
            # Extract range class from the property name if it contains domain/range info
            # For now, we'll use a simplified format
            property_value = f"{class_name}.{properties}"
        elif prop_type == 'data':
            # Data property format: "table.column": "Class.property"
            property_value = f"{class_name}.{properties}"
        else:
            # Default format
            property_value = f"{class_name}.{properties}"

        mappings_by_table[table_name][column_key] = property_value

    return mappings_by_table

def _update_global_schema_with_mappings(global_schema_summary: Dict[str, Any], results: List[Dict]) -> Dict[str, Any]:
    """
    Update global schema summary with new property mappings.

    Args:
        global_schema_summary: Current global schema summary
        results: New property mapping results

    Returns:
        Updated global schema summary
    """
    # Ensure previous_mappings exists
    if 'previous_mappings' not in global_schema_summary:
        global_schema_summary['previous_mappings'] = []

    # Convert results to the required format
    new_mappings = _format_previous_mappings_from_results(results)

    # Check if this is a list or dict format for previous_mappings
    if isinstance(global_schema_summary['previous_mappings'], list):
        # It's a list of mapping dictionaries
        # Check if we need to update existing entries or add new ones
        existing_tables = set()
        for mapping_dict in global_schema_summary['previous_mappings']:
            if isinstance(mapping_dict, dict):
                existing_tables.update(mapping_dict.keys())

        # Update existing or add new mappings
        for table_name, mappings in new_mappings.items():
            # Find if this table already has mappings
            table_found = False
            for mapping_dict in global_schema_summary['previous_mappings']:
                if isinstance(mapping_dict, dict) and table_name in mapping_dict:
                    # Update existing table mappings
                    mapping_dict[table_name].update(mappings)
                    table_found = True
                    break

            if not table_found:
                # Add new table mappings
                global_schema_summary['previous_mappings'].append({table_name: mappings})

    elif isinstance(global_schema_summary['previous_mappings'], dict):
        # It's a single dictionary
        global_schema_summary['previous_mappings'].update(new_mappings)

    return global_schema_summary
