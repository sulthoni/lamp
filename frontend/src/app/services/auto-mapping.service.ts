import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Candidate,
  ChromaDBCollectionsResponse,
  EmbeddingTermsResponse,
  FlatOntologySchema,
  LLMPropertiesSuggestionQuery,
  LLMPropertiesSuggestionResponse,
  LLMSelectionQuery,
  LLMSelectionResponse,
  OntologyClassSummary,
  RetrieveCandidatesQuery,
  RetrieveCandidatesResponse,
  SchemaSummaryRequest,
  SchemaSummaryResponse,
  SuggestedMappingClassProperties,
  SuggestedTermsResponse,
  TableSummaryStructure,
  Term,
  TermSuggestionUpdate,
  TermTable,
  UpdateTermSuggestionResponse,
} from '../models/automapping';

// Interface for the API response

@Injectable({ providedIn: 'root' })
export class AutoMappingService {
  constructor(private http: HttpClient) {}

  postMappingSuggestion(ontologyFile: File, tableFile: File): Observable<any> {
    const formData = new FormData();
    formData.append('ontology_file', ontologyFile);
    formData.append('metadata_file', tableFile);
    return this.http.post(
      `${environment.application.backendAdminUrl}/mapping-suggestion`,
      formData,
    );
  }

  saveToChromaDB(ontologyFile: File): Observable<any> {
    const formData = new FormData();
    formData.append('flatExportedSchemaJson', ontologyFile);
    return this.http.post(
      `${environment.application.backendAdminUrl}/save-to-chromadb`,
      formData,
    );
  }

  embeddingsAndSaveAsTextFile(
    sourceSchemaJson: any[],
    termSuggestionAsTable: TermTable[],
  ): Observable<any> {
    const formData = new FormData();
    formData.append('sourceSchemaJson', JSON.stringify(sourceSchemaJson));
    formData.append(
      'sourceSchemaTableJson',
      JSON.stringify(termSuggestionAsTable),
    );
    return this.http.post(
      `${environment.application.backendAdminUrl}/embeddings-and-save-as-text-file`,
      formData,
    );
  }

  termsSuggestion(
    sourceSchemaJson: any[],
    listOfSourceTables: string[],
  ): Observable<any> {
    const formData = new FormData();
    formData.append('terms', JSON.stringify(sourceSchemaJson));
    formData.append('tables', JSON.stringify(listOfSourceTables));
    return this.http.post(
      `${environment.application.backendAdminUrl}/terms-suggestion`,
      formData,
    );
  }

  /**
   * Check and get suggested terms from backend API
   * @returns Observable with the suggested terms response
   */
  checkSuggestedTerms(): Observable<SuggestedTermsResponse> {
    return this.http.get<SuggestedTermsResponse>(
      `${environment.application.backendAdminUrl}/check-suggested-terms`,
    );
  }

  /**
   * Check and get suggested terms with optional query parameters
   * @param params - Optional query parameters
   * @returns Observable with the suggested terms response
   */
  checkSuggestedTermsWithParams(params?: {
    limit?: number;
    offset?: number;
    filter?: string;
  }): Observable<SuggestedTermsResponse> {
    let queryParams = '';

    if (params) {
      const searchParams = new URLSearchParams();
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.offset)
        searchParams.append('offset', params.offset.toString());
      if (params.filter) searchParams.append('filter', params.filter);
      queryParams = searchParams.toString()
        ? `?${searchParams.toString()}`
        : '';
    }

    return this.http.get<SuggestedTermsResponse>(
      `${environment.application.backendAdminUrl}/check-suggested-terms${queryParams}`,
    );
  }

  /**
   * Check and get embedding terms from backend API
   * @returns Observable with the embedding terms response
   */
  checkEmbeddingTerms(): Observable<EmbeddingTermsResponse> {
    return this.http.get<EmbeddingTermsResponse>(
      `${environment.application.backendAdminUrl}/check-embeddings`,
    );
  }

  /**
   * Check and get embedding terms with optional query parameters
   * @param params - Optional query parameters
   * @returns Observable with the embedding terms response
   */
  checkEmbeddingTermsWithParams(params?: {
    limit?: number;
    offset?: number;
    filter?: string;
    similarity_threshold?: number;
  }): Observable<EmbeddingTermsResponse> {
    let queryParams = '';

    if (params) {
      const searchParams = new URLSearchParams();
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.offset)
        searchParams.append('offset', params.offset.toString());
      if (params.filter) searchParams.append('filter', params.filter);
      if (params.similarity_threshold)
        searchParams.append(
          'similarity_threshold',
          params.similarity_threshold.toString(),
        );
      queryParams = searchParams.toString()
        ? `?${searchParams.toString()}`
        : '';
    }

    return this.http.get<EmbeddingTermsResponse>(
      `${environment.application.backendAdminUrl}/check-embeddings${queryParams}`,
    );
  }

  /**
   * Check embeddings for specific terms
   * @param terms - Array of terms to check embeddings for
   * @returns Observable with the embedding terms response
   */
  checkEmbeddingsForTerms(terms: string[]): Observable<EmbeddingTermsResponse> {
    const formData = new FormData();
    formData.append('terms', JSON.stringify(terms));

    return this.http.post<EmbeddingTermsResponse>(
      `${environment.application.backendAdminUrl}/check-embeddings`,
      formData,
    );
  }

  /**
   * Get all ChromaDB collections from backend API
   * @returns Observable with the ChromaDB collections response
   */
  getChromaDBCollections(): Observable<ChromaDBCollectionsResponse> {
    return this.http.get<ChromaDBCollectionsResponse>(
      `${environment.application.backendAdminUrl}/chromadb-collections`,
    );
  }

  /**
   * Get ChromaDB collections with optional query parameters
   * @param params - Optional query parameters
   * @returns Observable with the ChromaDB collections response
   */
  getChromaDBCollectionsWithParams(params?: {
    limit?: number;
    offset?: number;
    filter?: string;
    include_metadata?: boolean;
    sort_by?: 'name' | 'count' | 'created_at';
    sort_order?: 'asc' | 'desc';
  }): Observable<ChromaDBCollectionsResponse> {
    let queryParams = '';

    if (params) {
      const searchParams = new URLSearchParams();
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.offset)
        searchParams.append('offset', params.offset.toString());
      if (params.filter) searchParams.append('filter', params.filter);
      if (params.include_metadata !== undefined)
        searchParams.append(
          'include_metadata',
          params.include_metadata.toString(),
        );
      if (params.sort_by) searchParams.append('sort_by', params.sort_by);
      if (params.sort_order)
        searchParams.append('sort_order', params.sort_order);

      queryParams = searchParams.toString()
        ? `?${searchParams.toString()}`
        : '';
    }

    return this.http.get<ChromaDBCollectionsResponse>(
      `${environment.application.backendAdminUrl}/chromadb-collections${queryParams}`,
    );
  }

  /**
   * Get specific ChromaDB collection by name
   * @param collectionName - Name of the collection to retrieve
   * @returns Observable with the ChromaDB collection response
   */
  getChromaDBCollection(
    collectionName: string,
  ): Observable<ChromaDBCollectionsResponse> {
    return this.http.get<ChromaDBCollectionsResponse>(
      `${
        environment.application.backendAdminUrl
      }/chromadb-collections/${encodeURIComponent(collectionName)}`,
    );
  }

  /**
   * Check if ChromaDB collections exist
   * @returns Observable with boolean indicating if collections exist
   */
  checkChromaDBCollectionsExist(): Observable<{
    exists: boolean;
    count: number;
  }> {
    return this.http.get<{ exists: boolean; count: number }>(
      `${environment.application.backendAdminUrl}/chromadb-collections/check`,
    );
  }

  /**
   * Get ChromaDB collections count only
   * @returns Observable with collections count
   */
  getChromaDBCollectionsCount(): Observable<{
    count: number;
    message: string;
  }> {
    return this.http.get<{ count: number; message: string }>(
      `${environment.application.backendAdminUrl}/chromadb-collections/count`,
    );
  }

  /**
   * Retrieve class candidates for table and column pairs from ChromaDB
   * @param queryData - The query data containing collection, model, queries, and result count
   * @returns Observable with the candidates response
   */
  retrieveCandidates(
    queryData: RetrieveCandidatesQuery,
  ): Observable<RetrieveCandidatesResponse> {
    const formData = new FormData();
    formData.append('queryData', JSON.stringify(queryData));

    return this.http.post<RetrieveCandidatesResponse>(
      `${environment.application.backendAdminUrl}/retrieve-candidates`,
      formData,
    );
  }

  /**
   * Retrieve candidates with simplified parameters
   * @param collectionName - Name of the ChromaDB collection
   * @param queries - Array of query strings (table/column descriptions)
   * @param nResults - Number of results to return (default: 3)
   * @param embeddingModel - Embedding model to use (default: "gemini-embedding-001")
   * @returns Observable with the candidates response
   */
  retrieveCandidatesSimple(
    collectionName: string,
    queries: any[],
    nResults: number = 7,
  ): Observable<RetrieveCandidatesResponse> {
    const queryData: RetrieveCandidatesQuery = {
      collection_name: collectionName,
      queries: queries,
      queries_table: queries,
      n_results: nResults,
    };

    return this.retrieveCandidates(queryData);
  }

  /**
   * Retrieve candidates for terms suggestion data
   * @param termsSuggestion - Array of terms suggestion objects
   * @param collectionName - Name of the ChromaDB collection
   * @param nResults - Number of results to return per query (default: 3)
   * @returns Observable with the candidates response
   */
  retrieveCandidatesForTerms(
    termsSuggestion: any[],
    collectionName: string,
    nResults: number = 7,
  ): Observable<RetrieveCandidatesResponse> {
    // Convert terms suggestion to query strings
    const queries = termsSuggestion
      .map((term) => {
        const tableDesc = term.improved_table_name || term.table_name || '';
        const columnDesc = term.improved_column_name || term.column_name || '';
        return `${tableDesc}, ${columnDesc}`.trim().replace(/^,\s*|,\s*$/g, '');
      })
      .filter((query) => query.length > 0);

    return this.retrieveCandidatesSimple(collectionName, queries, nResults);
  }

  /**
   * Select candidates using LLM from backend API
   * @param selectionData - The selection data containing provider, model, and candidates
   * @returns Observable with the LLM selection response
   */
  // llmSelectConcepts(
  //   selectionData: LLMSelectionQuery
  // ): Observable<LLMSelectionResponse> {
  //   const formData = new FormData();
  //   formData.append('selectionData', JSON.stringify(selectionData.candidates));
  //   formData.append(
  //     'selectionDataTable',
  //     JSON.stringify(selectionData.candidates_table)
  //   );

  //   return this.http.post<LLMSelectionResponse>(
  //     `${environment.application.backendAdminUrl}/llm-select-concepts`,
  //     formData
  //   );
  // }

  /**
   * Select candidates using LLM from backend API
   * @param selectionData - The selection data containing provider, model, and candidates
   * @returns Observable with the LLM selection response
   */
  llmSelectConcepts(
    selectionData: LLMSelectionQuery,
  ): Observable<LLMSelectionResponse> {
    const requestBody = {
      selectionData: selectionData.candidates,
      selectionDataTable: selectionData.candidates_table,
      globalSchemaSummary: selectionData.global_schema_summary,
    };

    return this.postJSON<LLMSelectionResponse>(
      `${environment.application.backendAdminUrl}/llm-select-concepts`,
      requestBody,
    );
  }

  /**
   * Select candidates using LLM with simplified parameters
   * @param candidates - Array of candidates from RetrieveCandidatesResponse.results
   * @param provider - LLM provider (default: "gemini")
   * @param model - LLM model (default: "gemini-2.5-flash")
   * @returns Observable with the LLM selection response
   */
  llmSelectConceptsSimple(
    candidates: Candidate[],
    candidates_table: Candidate[],
  ): Observable<LLMSelectionResponse> {
    const selectionData: LLMSelectionQuery = {
      candidates: candidates,
      candidates_table: candidates_table,
    };

    return this.llmSelectConcepts(selectionData);
  }

  /**
   * Select candidates using LLM from RetrieveCandidatesResponse
   * @param retrieveResponse - The complete response from retrieveCandidates
   * @param provider - LLM provider (default: "gemini")
   * @param model - LLM model (default: "gemini-2.5-flash")
   * @returns Observable with the LLM selection response
   */
  llmSelectConceptsFromRetrieveResponse(
    retrieveResponse: RetrieveCandidatesResponse,
  ): Observable<LLMSelectionResponse> {
    return this.llmSelectConceptsSimple(
      retrieveResponse.results,
      retrieveResponse.results_table,
    );
  }

  /**
   * Complete pipeline: Retrieve candidates and then select using LLM
   * @param queryData - The query data for retrieving candidates
   * @param provider - LLM provider (default: "gemini")
   * @param model - LLM model (default: "gemini-2.5-flash")
   * @returns Observable with the LLM selection response
   */
  retrieveAndSelectWithLLM(
    queryData: RetrieveCandidatesQuery,
    provider: string = 'gemini',
    model: string = 'gemini-2.5-flash',
  ): Observable<LLMSelectionResponse> {
    return new Observable((observer) => {
      this.retrieveCandidates(queryData).subscribe({
        next: (retrieveResponse) => {
          if (retrieveResponse.results && retrieveResponse.results.length > 0) {
            this.llmSelectConceptsFromRetrieveResponse(
              retrieveResponse,
            ).subscribe({
              next: (selectionResponse) => observer.next(selectionResponse),
              error: (error) => observer.error(error),
            });
          } else {
            observer.error(new Error('No candidates found to select from'));
          }
        },
        error: (error) => observer.error(error),
      });
    });
  }

  /**
   * Suggest properties using LLM from backend API
   * @param propertiesData - The properties data containing provider, model, and candidate properties
   * @returns Observable with the LLM properties suggestion response
   */
  llmSuggestProperties_Old(
    propertiesData: LLMPropertiesSuggestionQuery,
  ): Observable<LLMPropertiesSuggestionResponse> {
    const formData = new FormData();
    formData.append('propertiesData', JSON.stringify(propertiesData));

    return this.http.post<LLMPropertiesSuggestionResponse>(
      `${environment.application.backendAdminUrl}/llm-suggest-properties`,
      formData,
    );
  }

  /**
   * Suggest properties using LLM with simplified parameters
   * @param candidateProperties - SuggestedMappingClassProperties object
   * @param provider - LLM provider (default: "gemini")
   * @param model - LLM model (default: "gemini-2.5-flash")
   * @returns Observable with the LLM properties suggestion response
   */
  llmSuggestPropertiesSimple(
    candidateProperties: SuggestedMappingClassProperties,
    provider: string = 'gemini',
    model: string = 'gemini-2.5-flash',
  ): Observable<LLMPropertiesSuggestionResponse> {
    const propertiesData: LLMPropertiesSuggestionQuery = {
      candidate_properties: candidateProperties,
    };

    return this.llmSuggestProperties_Old(propertiesData);
  }

  /**
   * Suggest properties for selected mapping class properties
   * @param selectedProperties - Array of selected SuggestedMappingClassProperties
   * @returns Observable with combined results
   */
  llmSuggestPropertiesForSelected(
    selectedProperties: SuggestedMappingClassProperties[],
  ): Observable<{
    success: LLMPropertiesSuggestionResponse[];
    errors: any[];
    total: number;
  }> {
    return new Observable((observer) => {
      const results: LLMPropertiesSuggestionResponse[] = [];
      const errors: any[] = [];
      let completed = 0;

      if (selectedProperties.length === 0) {
        observer.next({ success: [], errors: [], total: 0 });
        observer.complete();
        return;
      }

      selectedProperties.forEach((property, index) => {
        this.llmSuggestPropertiesSimple(property).subscribe({
          next: (response) => {
            results.push(response);
            completed++;

            console.log(
              `Processed ${completed}/${selectedProperties.length}: ${property.table_name}`,
            );

            if (completed === selectedProperties.length) {
              observer.next({
                success: results,
                errors: errors,
                total: selectedProperties.length,
              });
              observer.complete();
            }
          },
          error: (error) => {
            errors.push({
              index,
              table: property.table_name,
              error: error.message || error,
            });
            completed++;

            console.error(`Error processing ${property.table_name}:`, error);

            if (completed === selectedProperties.length) {
              observer.next({
                success: results,
                errors: errors,
                total: selectedProperties.length,
              });
              observer.complete();
            }
          },
        });
      });
    });
  }

  /**
   * Mapping properties using LLM
   */
  llmSuggestProperties(
    selectedTableForMappingProperties: SuggestedMappingClassProperties[],
    globalSchemaSummary: string | null,
  ): Observable<{
    success: boolean;
    message: string;
    results: LLMPropertiesSuggestionResponse[];
  }> {
    const tableForMappingProperties: any[] = [];

    // Group selectedTableForMappingProperties by table_name
    const groupedByTableName = selectedTableForMappingProperties.reduce(
      (acc, prop) => {
        const tableName = prop.table_name || 'unknown_table';
        if (!acc[tableName]) {
          acc[tableName] = [];
        }
        acc[tableName].push(prop);
        return acc;
      },
      {} as { [key: string]: SuggestedMappingClassProperties[] },
    );

    // Feed the grouped result into tableForMappingProperties
    Object.entries(groupedByTableName).forEach(([tableName, properties]) => {
      tableForMappingProperties.push({
        table_name: tableName,
        properties: properties,
      });
    });

    const requestBody = {
      tableForMappingProperties: tableForMappingProperties,
      globalSchemaSummary: globalSchemaSummary,
    };

    return this.postJSON<{
      message: string;
      success: boolean;
      results: LLMPropertiesSuggestionResponse[];
      log: any[];
    }>(
      `${environment.application.backendAdminUrl}/llm-suggest-properties`,
      requestBody,
    );
  }

  /**
   * Write mapping data to backend and get R2RML result
   * @param mappingData - The selected suggested mapping class properties
   * @param ontologyFile - The ontology file in TTL format
   * @returns Observable with the write mapping response
   */
  writeMappingData(
    mappingData: SuggestedMappingClassProperties[],
    ontologyFile: File,
    isDataSourceCSV: boolean = false,
  ): Observable<{
    message: string;
    ontology_file_path: File;
    result: string;
  }> {
    const formData = new FormData();
    formData.append('mappingData', JSON.stringify(mappingData));
    formData.append('ontologyFile', ontologyFile);
    formData.append('isDataSourceCSV', JSON.stringify(isDataSourceCSV));

    return this.http.post<{
      message: string;
      ontology_file_path: File;
      result: string;
    }>(`${environment.application.backendAdminUrl}/write-mapping`, formData);
  }

  /**
   * Write mapping data with simplified parameters and better error handling
   * @param mappingData - The selected suggested mapping class properties
   * @param ontologyFile - The ontology file in TTL format
   * @returns Observable with enhanced response handling
   */
  writeMappingDataEnhanced(
    mappingData: SuggestedMappingClassProperties[],
    ontologyFile: File,
    isDataSourceCSV: boolean = false,
  ): Observable<{
    success: boolean;
    message: string;
    result: string;
    ontology_file_path: File;
    mappingCount: number;
  }> {
    return new Observable((observer) => {
      if (!mappingData || mappingData.length === 0) {
        observer.error(new Error('No mapping data provided'));
        return;
      }

      if (!ontologyFile) {
        observer.error(new Error('Ontology file is required'));
        return;
      }

      // Validate ontology file format
      // if (
      //   !ontologyFile.name.toLowerCase().endsWith('.ttl') &&
      //   !ontologyFile.type.includes('turtle') &&
      //   !ontologyFile.type.includes('text/plain')
      // ) {
      //   observer.error(new Error('Ontology file must be in TTL format'));
      //   return;
      // }

      // Filter only selected properties for better data transmission
      const selectedMappingData = mappingData
        .map((item) => ({
          ...item,
          llmPropertiesSuggestionResult:
            item.llmPropertiesSuggestionResult?.filter(
              (prop) => prop.selected,
            ) || [],
        }))
        .filter((item) => item.llmPropertiesSuggestionResult.length > 0);

      if (selectedMappingData.length === 0) {
        observer.error(
          new Error('No selected properties found in mapping data'),
        );
        return;
      }

      this.writeMappingData(
        selectedMappingData,
        ontologyFile,
        isDataSourceCSV,
      ).subscribe({
        next: (response) => {
          observer.next({
            success: true,
            message: response.message,
            result: response.result,
            ontology_file_path: response.ontology_file_path,
            mappingCount: selectedMappingData.reduce(
              (count, item) =>
                count + (item.llmPropertiesSuggestionResult?.length || 0),
              0,
            ),
          });
          observer.complete();
        },
        error: (error) => {
          console.error('Error writing mapping data:', error);
          observer.error(error);
        },
      });
    });
  }

  /**
   * Validate ontology file before sending
   * @param file - The ontology file to validate
   * @returns Promise<boolean> indicating if file is valid
   */
  private validateOntologyFile(file: File): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Check file extension
      const validExtensions = ['.ttl', '.turtle', '.n3'];
      const fileExtension = file.name
        .toLowerCase()
        .substring(file.name.lastIndexOf('.'));

      if (!validExtensions.includes(fileExtension)) {
        reject(
          new Error('Invalid file extension. Expected .ttl, .turtle, or .n3'),
        );
        return;
      }

      // Check file size (optional - adjust as needed)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        reject(new Error('Ontology file is too large. Maximum size is 50MB'));
        return;
      }

      // Check if file is empty
      if (file.size === 0) {
        reject(new Error('Ontology file is empty'));
        return;
      }

      // Basic content validation (check if it looks like TTL)
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
          const trimmedContent = content.trim();

          // Basic TTL syntax check
          const hasPrefixes = /@prefix|PREFIX/i.test(trimmedContent);
          const hasTriples = /\s+[a-zA-Z:_]\w*\s+[a-zA-Z:_<"]/i.test(
            trimmedContent,
          );
          const hasValidSyntax = /[.;]/.test(trimmedContent);

          if (hasPrefixes || hasTriples || hasValidSyntax) {
            resolve(true);
          } else {
            reject(
              new Error('File does not appear to contain valid TTL content'),
            );
          }
        } else {
          reject(new Error('Could not read file content'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };

      // Read only the first 1KB for validation
      reader.readAsText(file.slice(0, 1024));
    });
  }

  /**
   * Write mapping data with file validation
   * @param mappingData - The selected suggested mapping class properties
   * @param ontologyFile - The ontology file in TTL format
   * @returns Observable with enhanced response handling and validation
   */
  writeMappingDataWithValidation(
    mappingData: SuggestedMappingClassProperties[],
    ontologyFile: File,
  ): Observable<{
    success: boolean;
    message: string;
    result: string;
    mappingCount: number;
    validationPassed: boolean;
  }> {
    return new Observable((observer) => {
      // First validate the ontology file
      this.validateOntologyFile(ontologyFile)
        .then(() => {
          // File validation passed, proceed with mapping
          this.writeMappingDataEnhanced(mappingData, ontologyFile).subscribe({
            next: (response) => {
              observer.next({
                ...response,
                validationPassed: true,
              });
              observer.complete();
            },
            error: (error) => {
              observer.error(error);
            },
          });
        })
        .catch((validationError) => {
          console.error('Ontology file validation failed:', validationError);
          observer.error(
            new Error(
              `Ontology file validation failed: ${validationError.message}`,
            ),
          );
        });
    });
  }

  /**
   * Send schema summary (terms suggestion and ontology schema) to backend
   * @param termsSuggestion - Array of terms suggestion from source schema
   * @param flatExportedOntologySchema - Flattened ontology schema data
   * @returns Observable with the schema summary response
   */
  sendSchemaSummary(
    termsSuggestion: Term[],
    flatExportedOntologySchema: FlatOntologySchema[],
  ): Observable<SchemaSummaryResponse> {
    // Transform terms suggestion into table structure
    const tables: TableSummaryStructure = {};

    termsSuggestion.forEach((term) => {
      const tableName = term.table_name;
      const columnDesc = this.formatColumnDescription(term);

      if (!tables[tableName]) {
        tables[tableName] = [];
      }

      tables[tableName].push(columnDesc);
    });

    // Transform ontology schema into class structure
    const ontology: OntologyClassSummary = {};

    flatExportedOntologySchema.forEach((schema) => {
      const className = schema.label;
      const properties: string[] = [];

      // Add data properties
      schema.dataProperties.forEach((dataProp) => {
        properties.push(dataProp.name);
      });

      // Add object properties with range
      schema.objectProperties.forEach((objProp) => {
        properties.push(`${objProp.name} -> ${objProp.range}`);
      });

      if (properties.length > 0) {
        ontology[className] = properties;
      }
    });

    const requestBody: SchemaSummaryRequest = {
      tables,
      ontology,
    };

    return this.postJSON<SchemaSummaryResponse>(
      `${environment.application.backendAdminUrl}/schema-summary`,
      requestBody,
    );
  }

  /**
   * Helper method to format column description
   * @param term - Term object from terms suggestion
   * @returns Formatted column description string
   */
  private formatColumnDescription(term: Term): string {
    const columnName = term.column_name;
    const parts: string[] = [columnName];

    // Add data type if available
    if (term.data_type) {
      parts.push(`(${term.data_type})`);
    }

    // Add FK relationship if available
    if (term.related_table) {
      parts.push(`(FK -> ${term.related_table})`);
    }

    return parts.join(' ');
  }

  /**
   * Send schema summary with enhanced statistics
   * @param termsSuggestion - Array of terms suggestion
   * @param flatExportedOntologySchema - Flattened ontology schema
   * @returns Observable with enhanced response
   */
  sendSchemaSummaryEnhanced(
    termsSuggestion: Term[],
    flatExportedOntologySchema: FlatOntologySchema[],
  ): Observable<{
    success: boolean;
    message: string;
    summary: SchemaSummaryRequest;
  }> {
    return new Observable((observer) => {
      if (!termsSuggestion || termsSuggestion.length === 0) {
        observer.error(new Error('No terms suggestion provided'));
        return;
      }

      if (
        !flatExportedOntologySchema ||
        flatExportedOntologySchema.length === 0
      ) {
        observer.error(new Error('No ontology schema provided'));
        return;
      }

      this.sendSchemaSummary(
        termsSuggestion,
        flatExportedOntologySchema,
      ).subscribe({
        next: (response) => {
          // Calculate additional statistics
          const tablesWithFK = Object.values(response.summary.tables).filter(
            (columns) => columns.some((col) => col.includes('FK ->')),
          ).length;

          const classesWithObjProps = Object.values(
            response.summary.ontology,
          ).filter((props) =>
            props.some((prop) => prop.includes(' -> ')),
          ).length;

          observer.next({
            success: response.success,
            message: response.message,
            summary: response.summary,
          });
          observer.complete();
        },
        error: (error) => {
          console.error('Error sending schema summary:', error);
          observer.error(error);
        },
      });
    });
  }

  /**
   * Helper method for making JSON POST requests with consistent headers
   */
  private postJSON<T>(url: string, data: any): Observable<T> {
    return this.http.post<T>(url, data, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Helper method for updating term suggestions in the backend
   * @param suggestedTerm - The term suggestion update object
   * @returns Observable with the update response
   */
  updateTermSuggestion(
    suggestedTerm: TermSuggestionUpdate,
  ): Observable<UpdateTermSuggestionResponse> {
    return this.http.post<UpdateTermSuggestionResponse>(
      `${environment.application.backendAdminUrl}/update-term-suggestion`,
      { suggested_term: suggestedTerm },
    );
  }
}
