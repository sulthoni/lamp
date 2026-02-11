"""
Module for Pre-processing functions using LangChain.
- Ask LLM to enhance the term
"""
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_config import langchain_manager
from interface import TermImprovement, BatchTermImprovement
import os
import json

class TermImprovementChain:
    def __init__(self):
        self.llm = langchain_manager.get_llm()
        self.embeddings = langchain_manager.get_embeddings()
        self.config = langchain_manager.config
        self.single_parser = PydanticOutputParser(pydantic_object=TermImprovement)
        self.batch_parser = PydanticOutputParser(pydantic_object=BatchTermImprovement)
        self._setup_prompts()
        self._setup_chains()
        self.rate_limit_check = langchain_manager.rate_limit_check
    
    def _setup_prompts(self):
        """Setup prompt templates"""
        self.single_prompt = ChatPromptTemplate.from_template(
            """Role:
                You are an Ontology Engineer and Domain Expert specializing in semantic data integration. 
                You have extensive experience in understanding database schemas, interpreting domain-specific abbreviations, 
                and mapping data source structures to ontology concepts. 

                Instruction:
                You are given a table name and a column name. Your task is to:
                1. Expand any abbreviations or acronyms into their full, meaningful forms.
                2. Suggest clearer and more descriptive names for both tables and columns that accurately reflect their intended meaning.
                3. Translate the names into natural, grammatically correct English suitable for metadata documentation or ontology annotation.
                4. Maintain consistency in style and formatting across the outputs.


                Examples:
                - Input: {{"table_name": "master_indikators", "column_name": "produsen_data_name"}}
                - Output: {{"improved_table_name": "list of basic indicators", "improved_column_name": "name of data producer"}}

                Process this input:
                Table name: {table_name}
                Column name: {column_name}

                {format_instructions}

                Provide your response in the exact JSON format specified above."""
            )
        
        self.batch_prompt = ChatPromptTemplate.from_template(
            """Role:
                You are an Ontology Engineer and Domain Expert specializing in semantic data integration. 
                You have extensive experience in understanding database schemas, interpreting domain-specific abbreviations, 
                and mapping data source structures to ontology concepts. 

                Instruction:
                You are given a table name and column names. Your task is to:
                1. Expand any abbreviations or acronyms into their full, meaningful forms.
                2. Suggest clearer and more descriptive names for both tables and columns that accurately reflect their intended meaning.
                3. Translate the names into natural, grammatically correct English suitable for metadata documentation or ontology annotation.
                4. Maintain consistency in style and formatting across the outputs.
                5. Identify foreign key relationships, analyze each column to identify potential foreign key relationships with other tables:
                   - Identify columns that contain table names or references to other entities
                   - Consider semantic relationships where column names suggest references to other tables
                   - Only suggest relationships where the referenced table exists in the provided related_tables list
                   - For each identified foreign key column, provide a tuple of (column_name, referenced_table_name)

                Foreign Key Pattern Examples:
                - 'customer_id' → 'customers' table
                - 'product_code' → 'products' table  
                - 'category_ref' → 'categories' table

                Example:
                Input:
                {{
                    "table_name": "master_indikators",
                    "column_names": ["produsen_data_name", "pj_jabatan", "id_mskeg", "product_code", "category_ref"],
                    "related_tables": ["master_kegiatan", "products", "categories"]
                }}
                Output:
                {{
                    "improved_table_name": "list of basic indicators",
                    "improved_column_names": [
                        "name of data producer",
                        "person in charge position", 
                        "activity identity",
                        "product code",
                        "category reference"
                    ],
                    "related_tables": [("id_mskeg", "master_kegiatan"), ("product_code", "products"), ("category_ref", "categories")]
                }}

                Process this input:
                Table name: {table_name}
                Column names: {column_names}
                Related tables: {related_tables}

                {format_instructions}

                Provide your response in the exact JSON format specified above."""
            )
    
    def _setup_chains(self):
        """Setup LangChain chains"""
        self.single_chain = (
            self.single_prompt 
            | self.llm 
            | self.single_parser
        )
        
        self.batch_chain = (
            self.batch_prompt 
            | self.llm 
            | self.batch_parser
        )
    
    def improve_single_term(self, table_name: str, column_name: str, provider: str = None) -> Dict[str, Any]:
        """Improve a single table/column term"""
        provider = provider or langchain_manager.config.LLM_PROVIDER
        langchain_manager.rate_limit_check(provider, embeddings=False)
        
        try:
            result = self.single_chain.invoke({
                "table_name": table_name,
                "column_name": column_name,
                "format_instructions": self.single_parser.get_format_instructions()
            })
            
            return {
                "table_name": table_name,
                "column_name": column_name,
                "improved_table_name": result.improved_table_name,
                "improved_column_name": result.improved_column_name
            }
        except Exception as e:
            print(f"Error improving single term: {e}")
            return {
                "table_name": table_name,
                "column_name": column_name,
                "improved_table_name": None,
                "improved_column_name": None
            }

    def improve_batch_terms(self, table_name: str, column_names: List[str], related_tables: List[str], provider: str = None) -> List[Dict[str, Any]]:
        """Improve table and all column terms in batch"""
        provider = provider or langchain_manager.config.LLM_PROVIDER
        langchain_manager.rate_limit_check(provider, embeddings=False)
        
        try:
            result = self.batch_chain.invoke({
                "table_name": table_name,
                "column_names": column_names,
                "related_tables": related_tables,
                "format_instructions": self.batch_parser.get_format_instructions()
            })
            
            # Convert batch result to individual term improvements
            improvements = []
            for idx, column_name in enumerate(column_names):
                improved_column = (
                    result.improved_column_names[idx] 
                    if idx < len(result.improved_column_names) 
                    else None
                )
                improvements.append({
                    "table_name": table_name,
                    "column_name": column_name,
                    "improved_table_name": result.improved_table_name,
                    "improved_column_name": improved_column,
                    "related_table": next((tbl for col, tbl in result.related_tables if col == column_name), None)
                })
            
            return improvements
        except Exception as e:
            print(f"Error improving batch terms: {e}")
            # Fallback to None values
            return [
                {
                    "table_name": table_name,
                    "column_name": col,
                    "improved_table_name": None,
                    "improved_column_name": None,
                    "related_table": None
                }
                for col in column_names
            ]

def terms_suggestion_logic(terms_str: str, tables_str: str) -> Dict[str, Any]:
    """
    Handle terms suggestion logic using LangChain - refactored version
    """
    
    # Initialize the improvement chain
    improvement_chain = TermImprovementChain()
    llm_provider = improvement_chain.config.LLM_PROVIDER
    suggested_terms_file = improvement_chain.config.SUGGESTED_TERMS_FILE
    
    if(improvement_chain.config.SAVE_OUTPUT):    
        # Check if suggested_terms_file exists and has content
        if os.path.exists(suggested_terms_file) and os.path.getsize(suggested_terms_file) > 0:
            print(f"Using existing suggestions from {suggested_terms_file}")
            try:
                with open(suggested_terms_file, 'r') as f:
                    text_content = f.read()
                    suggested_result = []
                    for line in text_content.strip().split('\n'):
                        if line.strip():
                            try:
                                suggested_result.append(eval(line.strip()))
                            except:
                                suggested_result.append(line.strip())
                
                return {'message': 'Used existing suggestion terms from file', 'result': suggested_result}
            except Exception as e:
                print(f"Error reading existing file: {e}. Proceeding with LLM suggestions.")
    
    if not terms_str:
        return {'error': 'terms is required as a query parameter.'}

    terms = json.loads(terms_str)
    tables = json.loads(tables_str)
    
    # Process terms
    suggested_result = []
    
    for i, item in enumerate(terms, 1):
        table_name = item["table_name"]
        column_names = [col["column_name"] for col in item["columns"]]
        related_tables = [table for table in tables if table != table_name]
        
        print(f"Processing table {i} of {len(terms)}: {table_name}")
        
        # Use batch processing for better efficiency
        improvements = improvement_chain.improve_batch_terms(
            table_name=table_name,
            column_names=column_names,
            related_tables=related_tables,
            provider=llm_provider
        )
        
        suggested_result.extend(improvements)
    
    # Save results to file
    with open(suggested_terms_file, 'w') as f:
        for line in suggested_result:
            f.write(f"{line}\n")
    
    return {'message': 'Request suggestion to LLM successfully', 'result': suggested_result}

# Helper functions for file checking (unchanged)
def get_suggested_terms_file():
    """Check if suggested_terms.txt exists and return its content"""
    # Initialize the improvement chain
    improvement_chain = TermImprovementChain()

    suggested_terms_file = improvement_chain.config.SUGGESTED_TERMS_FILE
    
    if not os.path.exists(suggested_terms_file):
        return {"exists": False, "message": "Suggested terms file not found", "data": None}
    
    if os.path.getsize(suggested_terms_file) == 0:
        return {"exists": True, "message": "Suggested terms file is empty", "data": None}
    
    try:
        with open(suggested_terms_file, 'r') as f:
            content = f.read()
            suggested_terms = []
            for line in content.strip().split('\n'):
                if line.strip():
                    try:
                        suggested_terms.append(eval(line.strip()))
                    except:
                        suggested_terms.append(line.strip())
        
        return {
            "exists": True, 
            "message": f"Found {len(suggested_terms)} suggested terms", 
            "data": suggested_terms
        }
    except Exception as e:
        return {"exists": True, "message": f"Error reading file: {str(e)}", "data": None}

def embedding_and_save_as_text_file_logic(embedding_json_str, embedding_table_json_str, embedding_model):
    """Handle embedding process and save as text files using LangChain embeddings with rate limiting"""

    # Initialize LangChain embeddings with rate limiting
    improvement_chain = TermImprovementChain()
    embeddings = improvement_chain.embeddings

    embeddings_file = improvement_chain.config.TERMS_EMBEDDINGS_FILE or './data/embeddings.txt'
    embedding_table_file = improvement_chain.config.TERMS_EMBEDDINGS_TABLE_FILE or './data/embeddings_table.txt'

    if(improvement_chain.config.SAVE_OUTPUT):
        # Check for existing files
        if (os.path.exists(embedding_table_file) and os.path.getsize(embedding_table_file) > 0):
            
            print(f"Using existing embeddings from files")
            try:
                # with open(embeddings_file, 'r') as f:
                #     file_content = f.read().strip()
                #     results = []
                #     for line in file_content.split('\n'):
                #         if line.strip():
                #             try:
                #                 results.append(eval(line.strip()))
                #             except:
                #                 pass
                
                with open(embedding_table_file, 'r') as f:
                    file_content_table = f.read().strip()
                    results_table = []
                    for line in file_content_table.split('\n'):
                        if line.strip():
                            try:
                                results_table.append(eval(line.strip()))
                            except:
                                pass

                return {
                    'message': 'Used existing embeddings from file', 
                    'result': [], 
                    'result_table': results_table
                }
            except Exception as e:
                print(f"Error reading existing file: {e}. Proceeding with embedding processing.")

    if not embedding_json_str:
        return {'error': 'sourceSchemaJson is required as a query parameter.'}

    embedding_json = json.loads(embedding_json_str)
    embedding_table_json = json.loads(embedding_table_json_str)

    # Process column embeddings with rate limiting
    result = []
    # print(f"Processing {len(embedding_json)} column embeddings with rate limiting...")
    
    # for i, item in enumerate(embedding_json, 1):
    #     # Apply rate limiting check before each embedding request
    #     improvement_chain.rate_limit_check("gemini", embeddings=True)  # Assuming Gemini provider
        
    #     #### CHANGE IN THIS PART FOR EACH EXPERIMENT
    #     # Experiment 1: Basic embedding (just table and column name)
    #     embedding_text = f"{item['improved_table_name']} - {item['improved_column_name']}"
    #     print(f"Embedded column {i} of {len(embedding_json)}")
        
    #     # Use LangChain embeddings
    #     embedding_vector = embeddings.embed_query(embedding_text)
        
    #     result.append({
    #         "table_name": item['table_name'],
    #         "column_name": item['column_name'],
    #         "improved_table_name": item["improved_table_name"],
    #         "improved_column_name": item["improved_column_name"],
    #         "text_embedding": embedding_text,
    #         "embedding": embedding_vector
    #     })

    # Save column embeddings
    with open(embeddings_file, 'w') as f:
        for line in result:
            f.write(f"{line}\n")

    # Process table embeddings with rate limiting
    result_table = []
    print(f"Processing {len(embedding_table_json)} table embeddings with rate limiting...")
    
    for j, table in enumerate(embedding_table_json, 1):
        # Apply rate limiting check before each embedding request
        improvement_chain.rate_limit_check("gemini")  # Assuming Gemini provider
        
        #### CHANGE IN THIS PART FOR EACH EXPERIMENT
        # Experiment 2: Embedding with table name and all column names
        # embedding_text = f"This table represents {table['improved_table_name']}, including " + ", ".join(table['improved_column_names'])
        
        # Experiment 3: Extended embedding with data and data types
        embedding_text = create_enriched_table_embedding(table)
        print(f"Embedded table {j} of {len(embedding_table_json)}")
        
        # Use LangChain embeddings
        embedding_vector = embeddings.embed_query(embedding_text)
        
        result_table.append({
            "table_name": table['table_name'],
            "improved_table_name": table["improved_table_name"],
            "column_names": table['column_names'],
            "improved_column_names": table['improved_column_names'],
            "text_embedding": embedding_text,
            "embedding": embedding_vector
        })

    # Save table embeddings
    with open(embedding_table_file, 'w') as f:
        for line in result_table:
            f.write(f"{line}\n")

    return {
        'message': 'Embedding saved successfully using LangChain', 
        'result': result, 
        'result_table': result_table
    }

def get_embeddings_file():
    """Check if embeddings.txt exists and return its content"""
    # Initialize LangChain embeddings with rate limiting
    improvement_chain = TermImprovementChain()

    embeddings_file = improvement_chain.config.TERMS_EMBEDDINGS_FILE or './data/embeddings.txt'
    embeddings_table_file = improvement_chain.config.TERMS_EMBEDDINGS_TABLE_FILE or './data/embeddings_table.txt'
    
    if not os.path.exists(embeddings_table_file):
        return {"exists": False, "message": "Embeddings file not found", "data": None}
    
    if os.path.getsize(embeddings_table_file) == 0:
        return {"exists": True, "message": "Embeddings file is empty", "data": None}
    
    try:
        # with open(embeddings_file, 'r') as f:
        #     content = f.read()
        #     embeddings = []
        #     for line in content.strip().split('\n'):
        #         if line.strip():
        #             try:
        #                 embeddings.append(eval(line.strip()))
        #             except:
        #                 embeddings.append(line.strip())

        with open(embeddings_table_file, 'r') as f:
            content_table = f.read()
            embeddings_table = []
            for line in content_table.strip().split('\n'):
                if line.strip():
                    try:
                        embeddings_table.append(eval(line.strip()))
                    except:
                        embeddings_table.append(line.strip())
        embeddings = []
        return {
            "exists": True,
            "message": f"Found {len(embeddings)} embeddings",
            "data": embeddings,
            "data_table": embeddings_table
        }
    except Exception as e:
        return {"exists": True, "message": f"Error reading file: {str(e)}", "data": None}

def create_enriched_table_embedding(table: dict) -> str:
    """Create enriched embedding text for table with markdown format"""
    
    # Extract data from table object
    table_name = table.get('improved_table_name', '')
    original_table = table.get('table_name', '')
    column_names = table.get('improved_column_names', [])
    original_columns = table.get('column_names', [])
    related_tables = table.get('related_tables', [])
    data_types = table.get('data_types', {})
    sample_data = table.get('data', {})
    
    # Build enriched markdown embedding text
    embedding_parts = []
    
    # Table identification
    embedding_parts.append(f"# Table: {table_name}")
    if original_table != table_name:
        embedding_parts.append(f"**Original Name**: {original_table}")
    
    # Table description with context
    embedding_parts.append(f"**Description**: This table represents {table_name.lower()}")
    
    # Column information
    if column_names:
        embedding_parts.append(f"**Column Count**: {len(column_names)}")
        embedding_parts.append("## Columns")
        
        for i, col_name in enumerate(column_names):
            original_col = original_columns[i] if i < len(original_columns) else col_name
            col_key = original_columns[i] if i < len(original_columns) else col_name
            
            # Column details
            col_info = f"- **{col_name}**"
            if original_col != col_name:
                col_info += f" (original: {original_col})"
            
            # Data type information
            if col_key in data_types:
                col_info += f" - Type: {data_types[col_key]}"
            
            # Sample data patterns
            if col_key in sample_data and sample_data[col_key]:
                sample_values = sample_data[col_key][:3]  # First 3 samples
                col_info += f" - Examples: {', '.join(map(str, sample_values))}"
                
                # Data pattern analysis
                if all(str(v).isdigit() for v in sample_values if v):
                    col_info += " (numeric pattern)"
                elif all(len(str(v)) == 10 and '-' in str(v) for v in sample_values if v):
                    col_info += " (date pattern)"
                elif any('_' in str(v) or len(str(v)) > 20 for v in sample_values if v):
                    col_info += " (identifier pattern)"
            
            embedding_parts.append(col_info)
    
    # Relationships
    if related_tables:
        embedding_parts.append("## Relationships")
        for rel in related_tables:
            col_name = rel.get('column_name', '')
            related_table = rel.get('related_table', '')
            if col_name and related_table:
                # Find improved column name
                improved_col = col_name
                if col_name in original_columns:
                    idx = original_columns.index(col_name)
                    if idx < len(column_names):
                        improved_col = column_names[idx]
                
                embedding_parts.append(f"- **{improved_col}** references **{related_table}** table")
    
    # Data characteristics
    if sample_data:
        embedding_parts.append("## Data Characteristics")
        total_rows = len(next(iter(sample_data.values()), []))
        if total_rows > 0:
            embedding_parts.append(f"**Sample Size**: {total_rows} rows")
            
            # Unique value analysis
            unique_info = []
            for col_key, values in sample_data.items():
                if values:
                    unique_count = len(set(str(v) for v in values if v))
                    if unique_count == len(values):
                        unique_info.append(f"{col_key} (all unique)")
                    elif unique_count == 1:
                        unique_info.append(f"{col_key} (constant)")
            
            if unique_info:
                embedding_parts.append(f"**Uniqueness**: {', '.join(unique_info)}")
    
    # Domain context
    domain_indicators = []
    table_lower = table_name.lower()
    if any(word in table_lower for word in ['calendar', 'date', 'time', 'schedule']):
        domain_indicators.append("temporal data")
    if any(word in table_lower for word in ['service', 'route', 'transport', 'trip']):
        domain_indicators.append("transportation service")
    if any(word in table_lower for word in ['exception', 'error', 'invalid']):
        domain_indicators.append("exception handling")
    if any(word in table_lower for word in ['master', 'reference', 'lookup']):
        domain_indicators.append("reference data")
    
    if domain_indicators:
        embedding_parts.append(f"**Domain**: {', '.join(domain_indicators)}")
    
    return "\n".join(embedding_parts)