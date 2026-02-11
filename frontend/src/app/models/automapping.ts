export interface SuggestedTermsResponse {
  exists: boolean;
  message: string;
  data: Term[];
}

export interface Term {
  table_name: string;
  column_name: string;
  improved_table_name: string;
  improved_column_name: string;
  related_table?: string | null;
  data?: string[] | []; // Optional field for sample values
  data_type?: string | null; // Optional field for data type
}

export interface TermTable {
  table_name: string;
  column_names: string[];
  improved_table_name: string;
  improved_column_names: string[];
  related_tables?: RelatedTable[];
  data?: DataOfTermTable; // Sample data for each column
  data_types?: { [column_name: string]: string }; // Data types for each column
}

export interface RelatedTable {
  column_name: string;
  related_table: string;
}

export interface DataOfTermTable {
  [column_name: string]: any[]; // Each column name maps to an array of sample values
}

export interface SuggestedMappingClass extends Term {
  suggestedClass: string;
  suggestedClassIRI: string;
  selected: boolean;
}

export interface SuggestedMappingTableToClass extends TermTable {
  suggestedClass: string;
  suggestedClassIRI: string;
  selected: boolean;
  confidence_score?: number | null; // Optional confidence score
  reason?: string | null; // Optional reason for the suggestion
  related_columns?: string[]; // Optional list of related columns
  candidate_index?: number; // To track which candidate this is (0, 1, 2, etc.)
  total_candidates?: number; // Total number of candidates suggested
  term?: string; // The original term for this table-column pair
  suggestedColumns?: string[]; // List of columns associated with this suggestion
}

export interface SuggestedMappingClassProperties extends SuggestedMappingClass {
  dataProperties: DataProperties[];
  objectProperties: ObjectProperties[];
  columns?: string[] | { column_name: string; improved_column_name: string }[]; // List of column names associated with this table
  llmPropertiesSuggestionResult?: LLMPropertiesSuggestionResult[]; // List of selected data property names
  allSuggestionPropertiesSelected?: boolean; // Flag to indicate if all properties are selected
  related_columns?: string[]; // List of related columns
  confidence_score?: number | null; // Optional confidence score
  reason?: string | null; // Optional reason for the suggestion
  candidate_index?: number; // To track which candidate this is (0, 1, 2, etc.)
  total_candidates?: number; // Total number of candidates suggested
  term?: string; // The original term for this table-column pair
}

// Add this interface after the existing SuggestedTermsResponse interface
export interface EmbeddingTermsResponse {
  exists: boolean;
  message: string;
  data: any[];
  data_table: any[];
}

// Add this interface after the existing EmbeddingTermsResponse interface
export interface ChromaDBCollection {
  name: string;
  metadata: any;
  count: number;
}

export interface ChromaDBCollectionsResponse {
  success: boolean;
  message: string;
  collections: ChromaDBCollection[];
}

// Add this interface for the query data structure
export interface RetrieveCandidatesQuery {
  collection_name: string;
  queries: string[];
  queries_table: string[]; // New field for table-based queries
  n_results: number;
}

export interface Candidate {
  term: string;
  candidates: SimilarConcept[];
}

export interface SimilarConcept {
  description: string;
  explanatory_text: string;
  id: string; // URI of the concept from ontology
  label: string;
  similarity: number;
  synonyms: string[];
  data_properties?: DataProperties[]; // Optional field for data properties
  object_properties?: ObjectProperties[]; // Optional field for object properties
}

// Add this interface for the response
export interface RetrieveCandidatesResponse {
  message: string;
  collection_name: string;
  n_results: number;
  query_count: number;
  results: Candidate[];
  results_table: Candidate[]; // New field for table-based results
  log: string;
}

// Add this interface to your automapping.ts model file
export interface LLMSelectionQuery {
  candidates: Candidate[];
  candidates_table: Candidate[]; // New field for table-based candidates
  global_schema_summary?: SchemaSummaryRequest;
}

export interface LLMSelectionResult {
  term: string;
  selected_candidate: string;
  selected_candidate_URI: string;
  confidence_score: number;
  reason: string;
}

export interface LLMSelectionResultTable {
  term: string;
  selected_candidates: string[];
  selected_candidate_URIs: string[];
  confidence_scores: number[];
  reasons: string[];
  related_columns: string[][]; // To indicate which columns this selection applies to
  columns: string[][]; // List of columns associated with this term
}

export interface LLMSelectionResponse {
  message: string;
  total_processed: number;
  log: string;
  results: LLMSelectionResult[];
  results_table: LLMSelectionResultTable[]; // New field for table-based results
}

export interface FlatOntologySchema {
  label: string;
  description: string;
  definition: string;
  URI: string;
  similarClasses: any[];
  dataProperties: DataProperties[];
  objectProperties: ObjectProperties[];
}

export interface DataProperties {
  name: string;
  dataType: string;
  uriDataType: string;
}

export interface ObjectProperties {
  name: string;
  domain: string;
  uriDomain: string;
  range: string;
  uriRange: string;
}

// Add these interfaces to your existing automapping.ts
export interface LLMPropertiesSuggestionQuery {
  candidate_properties: SuggestedMappingClassProperties;
}

export interface LLMPropertiesSuggestionResult {
  table_name: string;
  column_name: string;
  properties: string;
  type: string; // "data" or "object"
  new_property: boolean;
  selected?: boolean;
  class_name?: string;
}

export interface LLMPropertiesSuggestionResponse {
  message: string;
  success: boolean;
  log: string;
  results: LLMPropertiesSuggestionResult[];
}

export interface GroupedPropertiesResult {
  table_name: string;
  column_name: string;
  suggestedClass: string;
  properties: LLMPropertiesSuggestionResult[];
  results: LLMPropertiesSuggestionResult[];
}

export interface GroupedPropertiesResult {
  table_name: string;
  column_name: string;
  suggestedClass: string;
  properties: LLMPropertiesSuggestionResult[];
}

export interface FlatPropertyRow {
  table_name: string;
  column_name: string;
  suggestedClass: string;
  properties: string;
  type: string;
  new_property: boolean;
  selected: boolean;
  originalIndex: number; // To track which original item this belongs to
  resultIndex: number; // To track which result in the llmPropertiesSuggestionResult array
}

// Add these interfaces to your automapping.ts file

export interface TableSummaryStructure {
  [tableName: string]: string[]; // Table name maps to array of column descriptions
}

export interface OntologyClassSummary {
  [className: string]: string[]; // Class name maps to array of properties
}

export interface SchemaSummaryRequest {
  tables: TableSummaryStructure;
  ontology: OntologyClassSummary;
}

export interface SchemaSummaryResponse {
  success: boolean;
  message: string;
  summary: {
    tables: TableSummaryStructure;
    ontology: OntologyClassSummary;
  };
}
