"""
Module for interface to interact with Angular frontend.
"""
from dataclasses import dataclass
from typing import List, Dict
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

# ------------------------------
# Data classes
# ------------------------------
@dataclass
class SimilarConcept:
    id: str
    label: str #Class label
    description: str
    explanatory_text: str
    synonyms: List[str]
    similarity: float
    data_properties: List[Dict] = None
    object_properties: List[Dict] = None

@dataclass
class ConceptEmbedding:
    id: str
    label: str #Class label
    description: str
    explanatory_text: str
    synonyms: List[str]
    text_embedding: str
    embedding: List[float] = None

@dataclass
class Candidate:
    term: str
    candidates: List[SimilarConcept]

@dataclass
class TermImprovement:
    table_name: str
    column_name: str
    improved_table_name: str = None
    improved_column_name: str = None
    text_embedding: str = None
    embedding: List[float] = None

@dataclass
class Column:
    column_name: str
    improved_column_name: str

@dataclass
class DataProperties:
    name: str
    dataType: str
    uriDataType: str

@dataclass
class ObjectProperties:
    name: str
    domain: str
    uriDomain: str
    range: str
    uriRange: str

@dataclass
class CandidateProperties:
    term: str
    table_name: str
    improved_table_name: str
    columns: List[Column]
    total_candidates: int
    suggestedClass: List[str]  # Array for multiple classes
    suggestedClassIRI: List[str]  # Array for multiple class IRIs
    data_properties: List[List[DataProperties]]  # Array of arrays for each class
    object_properties: List[List[ObjectProperties]]  # Array of arrays for each class
    suggestedColumns: List[List[str]]  # Array of arrays for each class
    related_columns: List[List[str]]  # Array of arrays for each class
    reason: List[str]  # Array for each class

@dataclass
class LLMPropertiesSuggestionResult:
    table_name: str
    column_name: str
    class_name: str
    properties: str
    type: str  # "data" or "object"
    new_property: bool
    selected: bool

@dataclass
class MappingProperties:
    table_name: str
    improved_table_name: str
    suggestedClass: str
    suggestedClassIRI: str
    selected: bool
    data_properties: List[DataProperties]
    object_properties: List[ObjectProperties]
    columns: List[Column]
    llmPropertiesSuggestionResult: List[LLMPropertiesSuggestionResult]


# Pydantic models for structured output
class TermImprovement(BaseModel):
    """Structured output for term improvement."""
    table_name: str = Field(description="Original table name")
    column_name: str = Field(description="Original column name")
    improved_table_name: str = Field(description="Improved, more descriptive table name")
    improved_column_name: str = Field(description="Improved, more descriptive column name")

class BatchTermImprovement(BaseModel):
    """Structured output for batch term improvement."""
    table_name: str = Field(description="Original table name")
    column_names: List[str] = Field(description="List of original column names")
    improved_table_name: str = Field(description="Improved, more descriptive table name")
    improved_column_names: List[str] = Field(description="List of improved column names")
    related_tables: List[tuple[str, str]] = Field(
        description="List of (column_name, related_table_name) pairs for columns that reference other tables. "
                   "For CSV data sources, identify columns that appear to be foreign keys or references to other tables "
                   "based on naming conventions (e.g., 'customer_id', 'user_id', 'product_code', etc.) or data patterns. "
                   "Match each foreign key column with its most likely referenced table from the available tables. "
                   "Only include columns that have clear relationships to other tables in the dataset. "
                   "Example: [('customer_id', 'customers'), ('product_id', 'products'), ('category_code', 'categories')]"
    )

class ConceptSelection(BaseModel):
    """Structured output for concept selection."""
    term: str = Field(description="The original term")
    selected_candidate: str = Field(description="The class name of the selected candidate concept")
    confidence_score: float = Field(description="Confidence score between 0.0 and 1.0")
    reason: str = Field(description="Explanation for the selection")

class ConceptSelectionTable(BaseModel):
    """Structured output for concept selection."""
    term: str = Field(description="The original term")
    selected_candidates: List[str] = Field(description="The class names of the selected candidate(s) concept")
    confidence_scores: List[float] = Field(description="Confidence score between 0.0 and 1.0")
    reasons: List[str] = Field(description="Explanation for the selections")
    class_uris: List[str] = Field(default_factory=list)
    columns: List[List[str]] = Field(
        description="List of column lists, where each inner list contains columns associated with the corresponding selected candidate concept. "
                   "For example, if there are 2 selected candidates, this should be [[columns_for_candidate_1], [columns_for_candidate_2]]. "
                   "The index of each column list matches the index of the selected candidate."
    )
    related_columns: List[List[str]] = Field(
        description="List of related column lists, where each inner list contains columns that connect to other concepts for the corresponding selected candidate. "
                   "For example, if there are 2 selected candidates, this should be [[related_cols_for_candidate_1], [related_cols_for_candidate_2]]. "
                   "The index of each related column list matches the index of the selected candidate."
    )


class PropertySuggestion(BaseModel):
    """Structured output for property suggestion."""
    table_name: str = Field(description="Original table name")
    column_name: str = Field(description="Original name of the column")
    class_name: str = Field(description="Suggested mapping class name")
    properties: str = Field(description="Suggested mapping property name")
    type: str = Field(description="Type of property: 'data' or 'object'")
    new_property: bool = Field(description="Whether this is a new property to be created")

class PropertyMappingList(BaseModel):
    """Schema for list of property mappings"""
    mappings: List[PropertySuggestion] = Field(description="List of property mappings")
