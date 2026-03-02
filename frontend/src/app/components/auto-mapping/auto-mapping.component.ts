import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FlatOntologySchema,
  LLMPropertiesSuggestionResponse,
  LLMSelectionQuery,
  LLMSelectionResponse,
  OntologyClassSummary,
  RetrieveCandidatesQuery,
  RetrieveCandidatesResponse,
  SchemaSummaryRequest,
  SuggestedMappingClass,
  SuggestedMappingClassProperties,
  SuggestedMappingTableToClass,
  TableSummaryStructure,
  Term,
  TermTable,
} from '../../models/automapping';
import { TableStructures } from '../../models/connections';
import { AutoMappingService } from '../../services/auto-mapping.service';
import { MappingService } from '../../services/mapping.service';

@Component({
  selector: 'app-auto-mapping',
  templateUrl: './auto-mapping.component.html',
  styleUrl: './auto-mapping.component.css',
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class AutoMappingComponent implements OnInit {
  ontologyFileName: string | null = null;
  tableFileName: string | null = null;
  ontologyFile: File | null = null;
  flatExportedOntologySchemaFile: File | null = null; // Reduced ontology file
  tableFile: File | null = null;
  result: string = '';
  globalSchemaSummary: string | null = null; // Global schema summary result
  embeddingsResult: any[] = [];
  embeddingsTableResult: any[] = [];
  loadingOntology = false;
  loadingSchema = false;
  loadingEmbedding = false;
  loadingCandidate = false;
  loadingSelectedCandidates = false;
  loadingProcessSelectedMappings = false; // Properties for selection management
  loadingProcessSelectedTableMappings = false; // Properties for selection management
  loadingPropertiesSuggestion = false;
  loadingProcessSelectedProperties = false;
  loadingWriteMapping = false;
  loadingTermsSuggestion = false; // Add this property with the other loading properties
  loadingSummary = false; // Add this property for summary loading
  error: string | null = null;
  errorOntology: string | null = null;
  errorSchema: string | null = null;
  errorEmbeddings: string | null = null;
  errorWriteMapping: string | null = null;
  successOntology: string | null = null;
  successSchema: string | null = null;
  successEmbeddings: string | null = null;
  successWriteMapping: string | null = null;
  flatExportedOntologySchemaJson: string | null = null; // Reduced ontology JSON
  flatExportedOntologySchemaData: FlatOntologySchema[] = []; // Reduced ontology data
  sourceSchemaJson: string | null = null; // Reduced table schema JSON
  sourceSchemaData: TableStructures | null = null; // Reduced table schema data
  sourceSchemaDataReformated: any[] = []; // Reformatted table schema data for display
  listOfSourceTables: string[] = []; // List of table names from source schema
  termsSuggestion: Term[] = []; // result of terms suggestion
  termSuggestionAsTable: TermTable[] = []; // terms suggestion as table
  chromaDBCollections: any[] = []; // ChromaDB collections
  selectedChromaDBCollection: string | null = null; // Selected ChromaDB collection
  candidatesResult: RetrieveCandidatesResponse | null = null; // Candidates result from backend
  selectedCandidatesResult: LLMSelectionResponse | null = null; // Selected candidates by LLM
  candidateResultView: string = ''; // String view of candidatesResult (log process)
  selectedCandidateResultView: string = ''; // String view of selectedCandidatesResult (log process)
  suggestedMappingClasses: SuggestedMappingClass[] = []; // Suggested mapping classes for terms (Columns to Class)
  suggestedMappingTableToClass: SuggestedMappingTableToClass[] = []; // Suggested mapping classes for tables (Tables to Class)
  suggestedMappingClassProperties: SuggestedMappingClassProperties[] = []; // Suggested mapping classes with properties for terms
  propertiesSuggestionResults: LLMPropertiesSuggestionResponse[] = [];
  selectedSuggestedMappingClassProperties: SuggestedMappingClassProperties[] =
    []; // Selected mapping class properties
  selectedSuggestedMappingClassPropertiesView: string = ''; // String view of selectedSuggestedMappingClassProperties (log process)
  disableProcessSelectedMappingsButton = false;
  disableProcessSelectedTableMappingsButton = false;
  allPropertiesSelected = false;
  disablePropertiesProcessSelectedMappingsButton = false;
  writeMappingResult: string = '';
  isDataSourceCSV: boolean = false; // Default to false

  private dbName = 'AutoMappingDB';
  private dbVersion = 1;
  private storeName = 'files';

  // Add this property for active tab tracking
  activeTab: string = 'input'; // Default tab
  private readonly ACTIVE_TAB_STORAGE_KEY = 'auto-mapping-active-tab';

  constructor(
    private autoMappingService: AutoMappingService,
    private ontologyMappingService: MappingService, // Inject the mapping service
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  async ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initDB();
      await this.loadSavedOntologyFiles(); // Wait for this to complete
      await this.loadSavedTableFiles();
      this.loadTermsSuggestionFromBackend();
      this.loadTermsEmbeddingFromBackend();
      this.getChromaDBCollections();
      this.loadGlobalSchemaSummary();

      // Load the saved active tab
      this.loadActiveTabFromStorage();
    }

    // Subscribe to the mapping service observables
    this.subscribeToMappingService();
  }

  /**
   * Subscribe to mapping service observables to get the flattened data
   */
  private subscribeToMappingService(): void {
    // Subscribe to flat exported schema data
    this.ontologyMappingService.flatExportedSchemaData$.subscribe((data) => {
      this.flatExportedOntologySchemaData = data;
      console.log(
        'Flat exported ontology schema data updated:',
        this.flatExportedOntologySchemaData,
      );
    });

    // Subscribe to flat exported schema JSON
    this.ontologyMappingService.flatExportedSchemaJson$.subscribe((json) => {
      this.flatExportedOntologySchemaJson = json;
      console.log('Flat exported ontology schema JSON updated');
    });
  }

  async onOntologyFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.ontologyFile = input.files[0];
      this.ontologyFileName = this.ontologyFile.name;

      // Parse the turtle file
      try {
        const text = await this.readFile(this.ontologyFile);
        await this.ontologyMappingService.parseTurtleContent(text);
        // Auto-export to JSON
        await this.ontologyMappingService.exportTurtleSchema();
        await this.saveFilesOntologyToStorage();
      } catch (error) {
        console.error('Failed to parse ontology file:', error);
        this.error = 'Failed to parse ontology file.';
      }
    }
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  onTableFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.tableFile = input.files[0];
      this.tableFileName = this.tableFile.name;
      this.saveFilesTableToStorage();
    }
  }

  /**
   * Send ontology to backend to save in chromadb
   * Send table file to backend to get embeddings and save in indexedDB
   * @param this.flatExportedSchemaJson - The reduced ontology JSON
   * @param this.tableFile - The table file
   */
  async postOntologyFiles() {
    this.result = '';
    this.errorOntology = null;
    this.successOntology = null;

    if (!this.flatExportedOntologySchemaFile) {
      this.errorOntology = 'Please select the ontology file.';
      return;
    }

    this.loadingOntology = true;

    try {
      // Ensure we have the exported schema JSON
      if (!this.flatExportedOntologySchemaJson) {
        console.log('No exported schema found, reading original file...');
        this.flatExportedOntologySchemaJson = await this.readFile(
          this.flatExportedOntologySchemaFile!,
        );
      }

      console.log('Exported schema data:', this.flatExportedOntologySchemaJson);

      //send to backend then save into ChromaDB
      console.log('Sending to ChromaDB...');
      this.autoMappingService
        .saveToChromaDB(this.flatExportedOntologySchemaFile!)
        .subscribe({
          next: (res) => {
            this.result =
              typeof res === 'string' ? res : JSON.stringify(res, null, 2);
            console.log(
              'Ontology process completed successfully!',
              this.result,
            );
            this.successOntology = res.message;
            this.loadingOntology = false;
          },
          error: (err) => {
            console.error('Error in postFiles:', err);
            this.errorOntology =
              err.error.error || 'Failed to process ontology file.';
            this.loadingOntology = false;
          },
        });
    } catch (error) {
      console.error('Error during posting files:', error);
      this.errorOntology = 'An error occurred while processing the files.';
    }
  }

  /**
   * Send ontology to backend to get term suggestions
   * @param this.flatExportedSchemaJson - The reduced ontology JSON
   * @param this.tableFile - The table file
   */
  async postFilesSchema() {
    this.errorSchema = null;
    this.successSchema = null;
    if (!this.tableFile) {
      this.errorSchema = 'Please select the table schema file.';
      return;
    }

    this.loadingSchema = true;

    try {
      // Get only table and column names from the table file
      if (!this.sourceSchemaJson) {
        console.log('No exported schema found, reading original file...');
        this.sourceSchemaJson = await this.readFile(this.tableFile);
      }

      this.listOfSourceTables = [];
      this.sourceSchemaData = JSON.parse(this.sourceSchemaJson || '[]');
      this.sourceSchemaDataReformated = Object.entries(
        this.sourceSchemaData!,
      ).map(([tableName, columns]) => {
        this.listOfSourceTables.push(tableName);
        return {
          table_name: tableName,
          columns: (columns as any[]).map((col) => ({
            column_name: col.name,
            data_type: col.type,
            related_table: col.relatedTable,
          })),
        };
      });
      console.log(
        'Reformatted source schema data:',
        this.sourceSchemaDataReformated,
      );

      //send to backend then embeddings
      console.log('Sending to backend for suggestion request...');
      this.autoMappingService
        .termsSuggestion(
          this.sourceSchemaDataReformated,
          this.listOfSourceTables,
        )
        .subscribe({
          next: (res) => {
            this.result =
              typeof res === 'string' ? res : JSON.stringify(res, null, 2);
            console.log('term process completed successfully!');
            this.successSchema = res.message;
            this.termsSuggestion = res.result;
            console.log('term suggestion', this.termsSuggestion);
            this.loadingSchema = false;
          },
          error: (err) => {
            console.error('Error in embeddings process:', err);
            this.errorSchema =
              err.error.error ||
              'Failed to process embedding table schema file.';
            this.loadingSchema = false;
          },
        });
    } catch (error) {
      console.error(
        'Error during processing embedding table schema files:',
        error,
      );
      this.errorSchema = 'An error occurred while processing the files.';
      this.loadingSchema = false;
    }
  }

  /**
   * Send table file to backend to get embeddings and save as text file
   * @param this.termsSuggestion - The reduced ontology JSON
   * @param this.tableFile - The table file
   */
  async postFilesSchemaEmbedding() {
    this.embeddingsResult = [];
    this.errorEmbeddings = null;
    this.successEmbeddings = null;

    this.loadingEmbedding = true;

    try {
      // Get only table and column names from the table file
      if (!this.termsSuggestion) {
        console.log('No suggestion term schema found, exit');
        this.errorEmbeddings = 'No suggestion term schema found, exit';
        return;
      }

      // Try get records from table file and populate termsSuggestion with data and data_type
      if (!this.sourceSchemaJson && this.tableFile) {
        this.sourceSchemaJson = await this.readFile(this.tableFile); // Read file content as string
      }

      if (this.sourceSchemaJson) {
        const sourceSchemaData = JSON.parse(this.sourceSchemaJson); // Parse JSON

        this.termsSuggestion.forEach((term) => {
          // Get the table from sourceSchemaJson using table_name
          const table = sourceSchemaData[term.table_name];

          if (table && Array.isArray(table)) {
            // Find the column by name in the table array
            const column = table.find(
              (col: any) => col.name === term.column_name,
            );

            if (column) {
              // Assign data and data_type from the found column
              term.data = column.data || []; // Sample data array
              term.data_type = column.type || null; // Data type (e.g., "VARCHAR(50)")

              console.log(
                `Updated term ${term.table_name}.${term.column_name}:`,
                {
                  data: term.data,
                  data_type: term.data_type,
                },
              );
            } else {
              // Column not found in table
              term.data = [];
              term.data_type = null;
              console.warn(
                `Column ${term.column_name} not found in table ${term.table_name}`,
              );
            }
          } else {
            // Table not found in sourceSchemaJson
            term.data = [];
            term.data_type = null;
            console.warn(
              `Table ${term.table_name} not found in sourceSchemaJson`,
            );
          }
        });

        console.log(
          'Updated termsSuggestion with data and data_type:',
          this.termsSuggestion,
        );
      }

      this.termSuggestionAsTable = Object.values(
        this.termsSuggestion.reduce(
          (acc, term) => {
            if (!acc[term.table_name]) {
              acc[term.table_name] = {
                table_name: term.table_name,
                column_names: [],
                improved_table_name: term.improved_table_name,
                improved_column_names: [],
                related_tables: [],
                data: {}, // Initialize data object for column sample data
                data_types: {}, // Initialize data_types object for column data types
              };
            }

            // Add column names and improved column names
            acc[term.table_name].column_names.push(term.column_name);
            acc[term.table_name].improved_column_names.push(
              term.improved_column_name,
            );

            // Add data and data_type for each column
            if (term.data) {
              acc[term.table_name].data![term.column_name] = term.data;
            }

            if (term.data_type) {
              acc[term.table_name].data_types![term.column_name] =
                term.data_type;
            }

            // Add related_table as a pair of column_name and related_table if related_table is not empty or null
            if (term.related_table && term.related_table.trim() !== '') {
              acc[term.table_name].related_tables!.push({
                column_name: term.column_name,
                related_table: term.related_table,
              });
            }

            return acc;
          },
          {} as { [key: string]: TermTable },
        ),
      );

      //send to backend then embeddings
      console.log('Sending to backend for embedding request...');
      this.autoMappingService
        .embeddingsAndSaveAsTextFile(
          this.termsSuggestion,
          this.termSuggestionAsTable,
        )
        .subscribe({
          next: (res) => {
            this.result =
              typeof res === 'string' ? res : JSON.stringify(res, null, 2);
            console.log('term process completed successfully!');
            this.successEmbeddings = res.message;
            this.embeddingsResult = res.result;
            this.embeddingsTableResult = res.result_table;
            console.log('embeddingsResult', this.embeddingsResult);
            this.loadingEmbedding = false;
            this.getChromaDBCollections(); // Refresh the collections after embedding
          },
          error: (err) => {
            console.error('Error in postFiles:', err);
            this.errorEmbeddings =
              err.error.error || 'Failed to process table schema file.';
            this.loadingEmbedding = false;
          },
        });
    } catch (error) {
      console.error('Error during processing table schema files:', error);
      this.errorEmbeddings = 'An error occurred while processing the files.';
      this.loadingEmbedding = false;
    }
  }

  // IndexedDB initialization
  private initDB(): Promise<IDBDatabase> {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('IndexedDB not available in this environment');
      return Promise.reject('IndexedDB not available');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  // Save files to IndexedDB
  async saveFilesOntologyToStorage() {
    try {
      if (!this.ontologyFile) {
        this.error = 'No files selected to save.';
        return;
      }

      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      if (!this.flatExportedOntologySchemaJson) return;
      const flatExportedSchemaJson_file = new Blob(
        [this.flatExportedOntologySchemaJson],
        {
          type: 'application/json',
        },
      );

      this.flatExportedOntologySchemaFile = flatExportedSchemaJson_file as File;

      // Save ontology file
      if (this.flatExportedOntologySchemaFile) {
        const ontologyData = {
          id: 'ontologyFile',
          file: this.ontologyFile, // Original ontology file
          flatExportedOntologySchemaFile: this.flatExportedOntologySchemaFile, // Reduced ontology file
          fileName: this.ontologyFileName,
          savedAt: new Date().toISOString(),
        };
        await this.promisifyRequest(store.put(ontologyData));
      }
    } catch (error) {
      console.error('Error saving files:', error);
      this.error = 'Failed to save files to storage.';
    }
  }

  async saveFilesTableToStorage() {
    try {
      if (!this.tableFile) {
        this.error = 'No files selected to save.';
        return;
      }

      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // Save table file
      if (this.tableFile) {
        const tableData = {
          id: 'tableFile',
          file: this.tableFile,
          fileName: this.tableFileName,
          savedAt: new Date().toISOString(),
        };
        await this.promisifyRequest(store.put(tableData));
      }

      // alert('Files saved successfully!');
    } catch (error) {
      console.error('Error saving files:', error);
      this.error = 'Failed to save files to storage.';
    }
  }

  // Load saved files from IndexedDB
  async loadSavedOntologyFiles(): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      // Use promisifyRequest to wait for the result
      const ontologyResult = await this.promisifyRequest(
        store.get('ontologyFile'),
      );

      if (ontologyResult) {
        this.ontologyFile = ontologyResult.file;
        this.flatExportedOntologySchemaFile =
          ontologyResult.flatExportedOntologySchemaFile;
        this.ontologyFileName = ontologyResult.fileName;

        // Now that we have the file, process it
        if (this.ontologyFile) {
          await this.processOntologyFile();
        }
      }
    } catch (error) {
      console.error('Error loading saved ontology files:', error);
    }
  }

  /**
   * Process the ontology file and ensure data is populated
   */
  private async processOntologyFile(): Promise<void> {
    if (!this.ontologyFile) {
      console.warn('No ontology file available to process');
      return;
    }

    try {
      console.log('Starting to process ontology file...');

      // Read the file content
      const text = await this.readFile(this.ontologyFile!);
      console.log('File read successfully, parsing turtle content...');

      // Parse the turtle content
      await this.ontologyMappingService.parseTurtleContent(text);
      console.log('Turtle content parsed successfully');

      // Export to get the flattened data
      const exportResult = this.ontologyMappingService.exportTurtleSchema();
      console.log('Export completed:', {
        hierarchicalCount: exportResult.hierarchical.length,
        flatCount: exportResult.flat.length,
      });

      // The subscription will automatically update flatExportedOntologySchemaData
      console.log('Ontology file processed successfully');
    } catch (error) {
      console.error('Failed to process ontology file:', error);
      this.error = 'Failed to process ontology file.';
    }
  }

  // Load saved files from IndexedDB
  async loadSavedTableFiles() {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      // Load table file
      const tableRequest = store.get('tableFile');
      tableRequest.onsuccess = () => {
        if (tableRequest.result) {
          this.tableFile = tableRequest.result.file;
          this.tableFileName = tableRequest.result.fileName;
        }
      };
    } catch (error) {
      console.error('Error loading saved files:', error);
    }
  }

  async loadTermsSuggestionFromBackend() {
    this.loadingTermsSuggestion = true; // Start loading

    try {
      this.autoMappingService.checkSuggestedTerms().subscribe({
        next: (res) => {
          console.log('Loaded terms suggestion from backend:', res.message);
          if (res && res.data) {
            this.termsSuggestion = res.data;
            console.log('termsSuggestion', res.data);
          }
          this.loadingTermsSuggestion = false; // Stop loading on success
        },
        error: (err) => {
          console.error('Error loading terms suggestion from backend:', err);
          this.loadingTermsSuggestion = false; // Stop loading on error
        },
      });
    } catch (error) {
      console.error('Error loading terms suggestion from backend:', error);
      this.loadingTermsSuggestion = false; // Stop loading on catch
    }
  }

  async loadTermsEmbeddingFromBackend() {
    try {
      this.autoMappingService.checkEmbeddingTerms().subscribe({
        next: (res) => {
          console.log('Loaded terms embedding from backend:', res.message);
          if (res && res.data) {
            this.embeddingsResult = res.data;
            this.embeddingsTableResult = res.data_table;
          }
        },
        error: (err) => {
          console.error('Error loading terms embedding from backend:', err);
        },
      });
    } catch (error) {
      console.error('Error loading terms embedding from backend:', error);
    }
  }

  // Delete ontology file from IndexedDB
  async deleteOntologyFile() {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      await this.promisifyRequest(store.delete('ontologyFile'));

      // Clear from component
      this.ontologyFile = null;
      this.flatExportedOntologySchemaFile = null;
      this.ontologyFileName = null;

      alert('Ontology file deleted successfully!');
    } catch (error) {
      console.error('Error deleting ontology file:', error);
      this.error = 'Failed to delete ontology file.';
    }
  }

  // Delete table file from IndexedDB
  async deleteTableFile() {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      await this.promisifyRequest(store.delete('tableFile'));

      // Clear from component
      this.tableFile = null;
      this.tableFileName = null;

      alert('Table file deleted successfully!');
    } catch (error) {
      console.error('Error deleting table file:', error);
      this.error = 'Failed to delete table file.';
    }
  }

  // Delete all files from IndexedDB
  async deleteAllFiles() {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      await this.promisifyRequest(store.clear());

      // Clear from component
      this.ontologyFile = null;
      this.flatExportedOntologySchemaFile = null;
      this.ontologyFileName = null;
      this.tableFile = null;
      this.tableFileName = null;

      alert('All files deleted successfully!');
    } catch (error) {
      console.error('Error deleting all files:', error);
      this.error = 'Failed to delete all files.';
    }
  }

  // Check if files are saved in storage
  async hasSavedOntologyFiles(): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      const ontologyRequest = await this.promisifyRequest(
        store.get('ontologyFile'),
      );

      return !!ontologyRequest;
    } catch (error) {
      console.error('Error checking saved files:', error);
      return false;
    }
  }

  // Check if files are saved in storage
  async hasSavedTableFiles(): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      const tableRequest = await this.promisifyRequest(store.get('tableFile'));

      return !!tableRequest;
    } catch (error) {
      console.error('Error checking saved files:', error);
      return false;
    }
  }

  // Helper function to promisify IndexedDB requests
  private promisifyRequest(request: IDBRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private saveToStorage(key: string, data: any) {
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (error) {
        console.warn('Storage not available:', error);
      }
    }
  }

  // Method to handle changes in the editable table
  onTermSuggestionChange(index: number, field: string, event: any) {
    const value = event.target.value;
    const term = this.termsSuggestion[index];

    switch (field) {
      case 'table_name':
        term.table_name = value;
        break;
      case 'column_name':
        term.column_name = value;
        break;
      case 'improved_table_name':
        term.improved_table_name = value;
        break;
      case 'improved_column_name':
        term.improved_column_name = value;
        break;
      default:
        console.warn('Unknown field:', field);
    }

    console.log('Updated termsSuggestion:', this.termsSuggestion);
  }

  // Method to add a new row
  addNewTermSuggestion() {
    this.termsSuggestion.push({
      column_name: '',
      improved_column_name: '',
      improved_table_name: '',
      table_name: '',
    });
  }

  // Method to remove a row
  removeTermSuggestion(index: number) {
    if (this.termsSuggestion.length > 1) {
      this.termsSuggestion.splice(index, 1);
    }
  }

  // Method to save the terms suggestion
  saveTermsSuggestion() {
    console.log('Saving terms suggestion:', this.termsSuggestion);
    // Add your save logic here
    alert('Terms suggestion saved successfully!');
  }

  // Method to reset the terms suggestion
  resetTermsSuggestion() {
    this.termsSuggestion = [
      {
        column_name: '',
        improved_column_name: '',
        improved_table_name: '',
        table_name: '',
      },
    ];
  }

  // Method to handle changes in the suggested mapping classes table
  onSuggestedMappingChange(index: number, field: string, event: any) {
    const value = event.target.value;
    const mapping = this.suggestedMappingClasses[index];

    switch (field) {
      case 'table_name':
        mapping.table_name = value;
        break;
      case 'column_name':
        mapping.column_name = value;
        break;
      case 'suggestedClass':
        mapping.suggestedClass = value;
        break;
      case 'suggestedClassIRI':
        mapping.suggestedClassIRI = value;
        break;
      default:
        console.warn('Unknown field:', field);
    }

    console.log(
      'Updated suggestedMappingClasses:',
      this.suggestedMappingClasses,
    );
  }

  onSuggestedMappingTableChange(index: number, field: string, event: any) {
    const value = event.target.value;
    const mapping = this.suggestedMappingTableToClass[index];

    switch (field) {
      case 'table_name':
        mapping.table_name = value;
        break;
      case 'suggestedClass':
        mapping.suggestedClass = value;
        break;
      case 'suggestedClassIRI':
        mapping.suggestedClassIRI = value;
        break;
      default:
        console.warn('Unknown field:', field);
    }

    console.log(
      'Updated suggestedMappingTableToClass:',
      this.suggestedMappingTableToClass,
    );
  }

  // Method to add a new suggested mapping row
  addNewSuggestedMapping() {
    this.suggestedMappingClasses.push({
      table_name: '',
      column_name: '',
      improved_table_name: '',
      improved_column_name: '',
      suggestedClass: '',
      suggestedClassIRI: '',
      selected: false, // Add this property
    });
  }

  // Method to remove a suggested mapping row
  removeSuggestedMapping(index: number) {
    if (this.suggestedMappingClasses.length > 1) {
      this.suggestedMappingClasses.splice(index, 1);
    }
  }

  removeSuggestedMappingTable(index: number) {
    if (this.suggestedMappingTableToClass.length > 1) {
      this.suggestedMappingTableToClass.splice(index, 1);
    }
  }

  // Method to save the suggested mapping classes
  saveSuggestedMappingClasses() {
    console.log(
      'Saving suggested mapping classes:',
      this.suggestedMappingClasses,
    );
    // Add your save logic here
    alert('Suggested mapping classes saved successfully!');
  }

  // Method to reset the suggested mapping classes
  resetSuggestedMappingClasses() {
    this.suggestedMappingClasses = [
      {
        table_name: '',
        column_name: '',
        improved_table_name: '',
        improved_column_name: '',
        suggestedClass: '',
        suggestedClassIRI: '',
        selected: false, // Add this property
      },
    ];
  }

  async getChromaDBCollections() {
    this.autoMappingService.getChromaDBCollections().subscribe({
      next: (response) => {
        if (response.success && response.collections.length > 0) {
          console.log(response.message); //
          this.chromaDBCollections = response.collections;
          if (!this.selectedChromaDBCollection) {
            this.selectedChromaDBCollection = this.chromaDBCollections[0].name;
          }

          // Process each collection
          response.collections.forEach((collection) => {
            console.log(
              `Collection: ${collection.name}, Count: ${collection.count}`,
            );
          });
        } else {
          console.log('No collections found');
        }
      },
      error: (error) => {
        console.error('Error fetching ChromaDB collections:', error);
        this.errorEmbeddings = 'Failed to fetch ChromaDB collections';
      },
    });
  }

  /**
   * Handle tab change and save to localStorage
   * @param tabId - The ID of the selected tab
   */
  onTabChange(tabId: string) {
    this.activeTab = tabId;
    this.saveActiveTabToStorage(tabId);
    console.log('Active tab changed to:', tabId);
  }

  /**
   * Save active tab to localStorage
   * @param tabId - The ID of the tab to save
   */
  private saveActiveTabToStorage(tabId: string) {
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(this.ACTIVE_TAB_STORAGE_KEY, tabId);
      } catch (error) {
        console.warn('Failed to save active tab to storage:', error);
      }
    }
  }

  /**
   * Load active tab from localStorage
   */
  private loadActiveTabFromStorage() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const savedTab = localStorage.getItem(this.ACTIVE_TAB_STORAGE_KEY);
        if (savedTab && this.isValidTabId(savedTab)) {
          this.activeTab = savedTab;

          // Use setTimeout to ensure DOM is ready
          setTimeout(() => {
            this.activateTab(savedTab);
          }, 100);
        }
      } catch (error) {
        console.warn('Failed to load active tab from storage:', error);
      }
    }
  }

  /**
   * Validate if the tab ID is valid
   * @param tabId - The tab ID to validate
   * @returns boolean indicating if the tab ID is valid
   */
  private isValidTabId(tabId: string): boolean {
    const validTabs = [
      'input',
      'preprocessing',
      'mapping',
      'evaluation',
      'output',
    ];
    return validTabs.includes(tabId);
  }

  /**
   * Programmatically activate a tab
   * @param tabId - The ID of the tab to activate
   */
  private activateTab(tabId: string) {
    if (isPlatformBrowser(this.platformId)) {
      try {
        // Remove active class from all tabs and tab panes
        const allTabButtons = document.querySelectorAll('.nav-link');
        const allTabPanes = document.querySelectorAll('.tab-pane');

        allTabButtons.forEach((btn) => {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
        });

        allTabPanes.forEach((pane) => {
          pane.classList.remove('show', 'active');
        });

        // Activate the selected tab
        const tabButton = document.querySelector(`#${tabId}-tab`);
        const tabPane = document.querySelector(`#${tabId}`);

        if (tabButton && tabPane) {
          tabButton.classList.add('active');
          tabButton.setAttribute('aria-selected', 'true');
          tabPane.classList.add('show', 'active');
        }
      } catch (error) {
        console.warn('Failed to activate tab:', error);
      }
    }
  }

  /**
   * Clear saved tab state (useful for testing or reset)
   */
  clearSavedTabState() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.removeItem(this.ACTIVE_TAB_STORAGE_KEY);
        console.log('Saved tab state cleared');
      } catch (error) {
        console.warn('Failed to clear saved tab state:', error);
      }
    }
  }

  retrieveCandidates() {
    this.candidatesResult = null;
    this.candidateResultView = '';
    this.loadingCandidate = true;

    try {
      if (this.embeddingsTableResult.length === 0) {
        this.candidateResultView =
          'No embeddings available to retrieve candidates.';
        this.loadingCandidate = false;
        return;
      }

      const query: RetrieveCandidatesQuery = {
        collection_name: this.selectedChromaDBCollection || '',
        queries: this.embeddingsResult.map((e) => e.text_embedding),
        queries_table: this.embeddingsTableResult.map((e) => e.text_embedding),
        n_results: 7,
      };

      this.autoMappingService.retrieveCandidates(query).subscribe({
        next: (res) => {
          console.log('Candidates retrieved from backend:', res);
          this.candidatesResult = res;
          this.candidateResultView = this.candidatesResult?.log || '';
          this.loadingCandidate = false;
        },
        error: (err) => {
          console.error('Error retrieving candidates from backend:', err);
          this.error = 'Failed to retrieve candidates from backend.';
          this.loadingCandidate = false;
        },
      });
    } catch (error) {
      console.error('Error retrieving candidates from backend:', error);
      this.error = 'Failed to retrieve candidates from backend.';
      this.loadingCandidate = false;
    }
  }

  selectCandidatesWithLLM() {
    this.selectedCandidatesResult = null;
    this.selectedCandidateResultView = '';
    this.loadingSelectedCandidates = true;

    try {
      if (!this.candidatesResult) {
        this.selectedCandidateResultView = 'No candidates available to select.';
        this.loadingSelectedCandidates = false;
        return;
      }

      const selectionData: LLMSelectionQuery = {
        candidates: this.candidatesResult.results,
        candidates_table: this.candidatesResult.results_table,
        global_schema_summary: JSON.parse(this.globalSchemaSummary!),
      };

      this.autoMappingService.llmSelectConcepts(selectionData).subscribe({
        next: (res) => {
          console.log('LLM selection response:', res);
          this.selectedCandidatesResult = res;
          this.selectedCandidateResultView =
            this.selectedCandidatesResult?.log || '';
          this.loadingSelectedCandidates = false;

          //add suggested mapping column to class
          this.suggestedMappingClasses = this.termsSuggestion.map((term) => {
            const candidate = this.selectedCandidatesResult?.results.find(
              (c) =>
                // Scenario 1
                // c.term ===
                // 'table ' +
                //   term.improved_table_name +
                //   ', column ' +
                //   term.improved_column_name

                // Scenario 2
                // c.term ===
                // term.improved_table_name + ', ' + term.improved_column_name

                // Scenario 3
                c.term ===
                term.improved_table_name + ' - ' + term.improved_column_name,
            );
            return {
              ...term,
              related_table: term.related_table,
              suggestedClass: candidate ? candidate.selected_candidate : '',
              suggestedClassIRI: candidate
                ? candidate.selected_candidate_URI
                : '',
              selected: false, // Initialize as not selected
            };
          });
          console.log('suggestedMappingClasses', this.suggestedMappingClasses);

          // suggested mapping table to class
          this.suggestedMappingTableToClass = [];

          this.embeddingsTableResult.forEach((embeddings) => {
            const candidate = this.selectedCandidatesResult?.results_table.find(
              (c) => c.term === embeddings.text_embedding,
            );

            if (
              candidate &&
              candidate.selected_candidates &&
              candidate.selected_candidate_URIs
            ) {
              // Handle multiple candidates - create entry for each candidate
              candidate.selected_candidates.forEach(
                (selectedCandidate: string, index: number) => {
                  const selectedCandidateURI =
                    candidate.selected_candidate_URIs[index];
                  const confidenceScore = candidate.confidence_scores
                    ? candidate.confidence_scores[index]
                    : null;
                  const reason = candidate.reasons
                    ? candidate.reasons[index]
                    : '';
                  const relatedColumns = candidate.related_columns
                    ? candidate.related_columns[index]
                    : null;
                  const columns = candidate.columns
                    ? candidate.columns[index]
                    : null;

                  this.suggestedMappingTableToClass.push({
                    term: candidate.term,
                    table_name: embeddings.table_name,
                    column_names: embeddings.column_names,
                    improved_table_name: embeddings.improved_table_name,
                    improved_column_names: embeddings.improved_column_names,
                    related_tables: embeddings.related_table,
                    suggestedClass: selectedCandidate,
                    suggestedClassIRI: selectedCandidateURI,
                    suggestedColumns: columns!, // Suggested columns for this candidate
                    confidence_score: confidenceScore,
                    reason: reason,
                    related_columns: relatedColumns!,
                    candidate_index: index, // Track which candidate this is (0, 1, 2, etc.)
                    total_candidates: candidate.selected_candidates.length, // Track total number of candidates
                    selected: index === 0, // Select first candidate by default, others unselected
                  });
                },
              );
            } else {
              // No candidate found or empty candidates - create single entry with empty values
              this.suggestedMappingTableToClass.push({
                table_name: embeddings.table_name,
                column_names: embeddings.column_names,
                improved_table_name: embeddings.improved_table_name,
                improved_column_names: embeddings.improved_column_names,
                related_tables: embeddings.related_table,
                suggestedClass: '',
                suggestedClassIRI: '',
                confidence_score: null,
                reason: '',
                related_columns: [],
                candidate_index: 0,
                total_candidates: 0,
                selected: false,
              });
            }
          });
          console.log(
            'suggestedMappingTableToClass',
            this.suggestedMappingTableToClass,
          );
        },
        error: (err) => {
          console.error('Error during LLM selection:', err);
          this.error = 'Failed to select candidates with LLM.';
          this.loadingSelectedCandidates = false;
        },
      });
    } catch (error) {
      console.error('Error during LLM selection:', error);
      this.error = 'Failed to select candidates with LLM.';
      this.loadingSelectedCandidates = false;
    }
  }

  // Method to handle individual mapping selection change
  onMappingSelectionChange() {
    // This method can be used to trigger any additional logic when selection changes
    this.disableProcessSelectedMappingsButton = false; // Re-enable button when selection changes
    console.log(
      'Selection changed. Selected count:',
      this.getSelectedMappingsCount(),
    );
  }

  onMappingTableSelectionChange() {
    // This method can be used to trigger any additional logic when selection changes
    this.disableProcessSelectedTableMappingsButton = false; // Re-enable button when selection changes
    console.log(
      'Table to Class Selection changed. Selected count:',
      this.getSelectedTableMappingsCount(),
    );
  }

  // Method to check if all mappings are selected
  areAllMappingsSelected(): boolean {
    if (
      !this.suggestedMappingClasses ||
      this.suggestedMappingClasses.length === 0
    ) {
      return false;
    }
    return this.suggestedMappingClasses.every((mapping) => mapping.selected);
  }

  areAllTableToClassMappingsSelected(): boolean {
    if (
      !this.suggestedMappingTableToClass ||
      this.suggestedMappingTableToClass.length === 0
    ) {
      return false;
    }
    return this.suggestedMappingTableToClass.every(
      (mappingTable) => mappingTable.selected,
    );
  }

  // Method to check if some (but not all) mappings are selected
  areSomeMappingsSelected(): boolean {
    if (
      !this.suggestedMappingClasses ||
      this.suggestedMappingClasses.length === 0
    ) {
      return false;
    }
    const selectedCount = this.suggestedMappingClasses.filter(
      (mapping) => mapping.selected,
    ).length;
    return (
      selectedCount > 0 && selectedCount < this.suggestedMappingClasses.length
    );
  }

  areSomeTableToClassMappingsSelected(): boolean {
    if (
      !this.suggestedMappingTableToClass ||
      this.suggestedMappingTableToClass.length === 0
    ) {
      return false;
    }
    const selectedCount = this.suggestedMappingTableToClass.filter(
      (mappingTable) => mappingTable.selected,
    ).length;
    return (
      selectedCount > 0 &&
      selectedCount < this.suggestedMappingTableToClass.length
    );
  }

  // Method to toggle all mappings selection
  toggleAllMappingsSelection(event: any) {
    const isChecked = event.target.checked;
    this.suggestedMappingClasses.forEach((mapping) => {
      mapping.selected = isChecked;
    });
    console.log('All mappings selection toggled:', isChecked);
  }

  toggleAllTableToClassMappingsSelection(event: any) {
    const isChecked = event.target.checked;
    this.suggestedMappingTableToClass.forEach((mappingTable) => {
      mappingTable.selected = isChecked;
    });
    console.log('All table-to-class mappings selection toggled:', isChecked);
  }

  // Method to get count of selected mappings
  getSelectedMappingsCount(): number {
    if (!this.suggestedMappingClasses) {
      return 0;
    }
    return this.suggestedMappingClasses.filter((mapping) => mapping.selected)
      .length;
  }

  getSelectedTableMappingsCount(): number {
    if (!this.suggestedMappingTableToClass) {
      return 0;
    }
    return this.suggestedMappingTableToClass.filter(
      (mappingTable) => mappingTable.selected,
    ).length;
  }

  // Method to get selected mappings
  getSelectedMappings() {
    if (!this.suggestedMappingClasses) {
      return [];
    }
    return this.suggestedMappingClasses.filter((mapping) => mapping.selected);
  }

  // Method to process selected mappings by user
  async selectMappingClassByUser() {
    const selectedMappings = this.getSelectedMappings();

    if (selectedMappings.length === 0) {
      alert('Please select at least one mapping to process.');
      return;
    }

    this.loadingProcessSelectedMappings = true;

    try {
      console.log('Processing selected properties mappings:', selectedMappings);

      if (this.flatExportedOntologySchemaFile) {
        this.flatExportedOntologySchemaJson = await this.readFile(
          this.flatExportedOntologySchemaFile,
        );
        console.log(
          'Flat Exported Ontology Schema JSON:',
          this.flatExportedOntologySchemaJson,
        );
        this.flatExportedOntologySchemaData = JSON.parse(
          this.flatExportedOntologySchemaJson,
        );

        //find properties of selected classes and update the flatExportedOntologySchemaData
        this.suggestedMappingClassProperties = selectedMappings.map(
          (mapping) => {
            const classData = this.flatExportedOntologySchemaData.find(
              (item) =>
                item.URI === mapping.suggestedClassIRI ||
                item.label == mapping.suggestedClass,
            );
            const columns: any[] = this.suggestedMappingClasses
              .filter((col) => col.table_name === mapping.table_name)
              .map((col) => ({
                column_name: col.column_name,
                improved_column_name: col.improved_column_name,
              }));
            return {
              table_name: mapping.table_name,
              column_name: mapping.column_name,
              improved_table_name: mapping.improved_table_name,
              improved_column_name: mapping.improved_column_name,
              suggestedClass: mapping.suggestedClass,
              suggestedClassIRI: mapping.suggestedClassIRI,
              selected: mapping.selected,
              dataProperties: classData ? classData.dataProperties : [],
              objectProperties: classData ? classData.objectProperties : [],
              columns: columns,
            };
          },
        );
        console.log(
          'Suggested Mapping Class Properties:',
          this.suggestedMappingClassProperties,
        );
        console.log(
          'Suggested Mapping Class Properties:',
          JSON.stringify(this.suggestedMappingClassProperties, null, 2),
        );
      }
    } catch (error) {
      console.error('Error processing selected mappings:', error);
      alert('Failed to process selected mappings. Please try again.');
    } finally {
      this.loadingProcessSelectedMappings = false;
      this.disableProcessSelectedMappingsButton = true; // Disable button after processing
    }
  }

  // Method to process selected table-to-class mappings by user
  async selectMappingTableToClassByUser() {
    const selectedTableMappings = this.suggestedMappingTableToClass.filter(
      (mapping) => mapping.selected,
    );

    if (selectedTableMappings.length === 0) {
      alert('Please select at least one table mapping to process.');
      return;
    }

    this.loadingProcessSelectedTableMappings = true;

    try {
      console.log(
        'Processing selected table-to-class mappings:',
        selectedTableMappings,
      );

      if (this.flatExportedOntologySchemaFile) {
        this.flatExportedOntologySchemaJson = await this.readFile(
          this.flatExportedOntologySchemaFile,
        );
        console.log(
          'Flat Exported Ontology Schema JSON:',
          this.flatExportedOntologySchemaJson,
        );
        this.flatExportedOntologySchemaData = JSON.parse(
          this.flatExportedOntologySchemaJson,
        );

        // Find properties of selected classes and update the data structure
        this.suggestedMappingClassProperties = selectedTableMappings.map(
          (mapping) => {
            const classData = this.flatExportedOntologySchemaData.find(
              (item) =>
                item.URI === mapping.suggestedClassIRI ||
                item.label == mapping.suggestedClass,
            );

            return {
              term: mapping.term,
              table_name: mapping.table_name,
              column_name: mapping.column_names[0],
              improved_table_name: mapping.improved_table_name,
              improved_column_name: mapping.improved_column_names[0],
              related_tables: mapping.related_tables,
              suggestedClass: mapping.suggestedClass,
              suggestedClassIRI: mapping.suggestedClassIRI,
              suggestedColumns: mapping.suggestedColumns, // Suggested columns for this mapping from mapping table to class
              selected: mapping.selected,
              confidence_score: mapping.confidence_score,
              reason: mapping.reason,
              related_columns: mapping.related_columns,
              candidate_index: mapping.candidate_index,
              total_candidates: mapping.total_candidates,
              dataProperties: classData ? classData.dataProperties : [],
              objectProperties: classData ? classData.objectProperties : [],
              columns: mapping.column_names.map((colName, index) => ({
                //original column names
                column_name: colName,
                improved_column_name: mapping.improved_column_names[index],
              })),
            };
          },
        );
        console.log(
          'Updated Suggested Mapping Class Properties:',
          this.suggestedMappingClassProperties,
        );
        console.log(
          'Suggested Mapping Class Properties (formatted):',
          JSON.stringify(this.suggestedMappingClassProperties, null, 2),
        );
      }
    } catch (error) {
      console.error('Error processing selected table mappings:', error);
      alert('Failed to process selected table mappings. Please try again.');
    } finally {
      this.loadingProcessSelectedTableMappings = false;
      this.disableProcessSelectedTableMappingsButton = true; // Disable button after processing
      this.suggestPropertiesWithLLM();
    }
  }

  private updateFlattenedDataFromService(): void {
    const currentData = this.ontologyMappingService.getCurrentExportedData();
    this.flatExportedOntologySchemaData = currentData.flat;
    this.flatExportedOntologySchemaJson = currentData.flatJson;

    console.log(
      'Updated flattened data from service:',
      this.flatExportedOntologySchemaData,
    );
  }

  async getPropertiesOfSelectedClass() {
    if (this.flatExportedOntologySchemaFile) {
      this.flatExportedOntologySchemaJson = await this.readFile(
        this.flatExportedOntologySchemaFile,
      );
      console.log(
        'Flat Exported Ontology Schema JSON:',
        this.flatExportedOntologySchemaJson,
      );
      this.flatExportedOntologySchemaData = JSON.parse(
        this.flatExportedOntologySchemaJson,
      );
    }
  }

  /**
   * Suggest properties using LLM for selected mapping class properties
   */
  async suggestPropertiesWithLLM() {
    if (
      !this.suggestedMappingClassProperties ||
      this.suggestedMappingClassProperties.length === 0
    ) {
      alert('No properties available to process.');
      return;
    }

    this.selectedSuggestedMappingClassProperties =
      this.suggestedMappingClassProperties.filter((prop) => prop.selected);

    if (this.selectedSuggestedMappingClassProperties.length === 0) {
      alert('Please select at least one property to process.');
      return;
    }

    if (!this.globalSchemaSummary) {
      this.loadGlobalSchemaSummary();
    }

    this.loadingPropertiesSuggestion = true;

    try {
      // Process selected properties using subscribe
      this.autoMappingService
        .llmSuggestProperties(
          this.selectedSuggestedMappingClassProperties,
          this.globalSchemaSummary,
        )
        .subscribe({
          next: (result) => {
            if (result.success) {
              // Process properties suggestion results and map them by table_name
              this.propertiesSuggestionResults = result.results;
              console.log(
                'Updated propertiesSuggestionResults:',
                this.propertiesSuggestionResults,
              );
              // Map propertiesSuggestionResults to selectedSuggestedMappingClassProperties using table_name
              this.selectedSuggestedMappingClassProperties.forEach(
                (classProperty) => {
                  // Find matching result by searching through results array for matching table_name
                  const matchingResult = this.propertiesSuggestionResults.find(
                    (suggestionResult: LLMPropertiesSuggestionResponse) => {
                      // Check if any result in the results array has matching table_name
                      return suggestionResult.results?.some(
                        (result) =>
                          result.table_name === classProperty.table_name &&
                          result.class_name === classProperty.suggestedClass,
                      );
                    },
                  );
                  if (
                    matchingResult &&
                    matchingResult.results &&
                    matchingResult.results.length > 0
                  ) {
                    // Filter results to only include those matching the current table_name and class_name
                    const filteredResults = matchingResult.results.filter(
                      (result) =>
                        result.table_name === classProperty.table_name &&
                        result.class_name === classProperty.suggestedClass,
                    );
                    classProperty.llmPropertiesSuggestionResult =
                      filteredResults;
                  } else {
                    classProperty.llmPropertiesSuggestionResult = [];
                  }
                },
              );
              // Set selected to true for existing (non-new) properties
              this.selectedSuggestedMappingClassProperties.forEach((item) => {
                if (item.llmPropertiesSuggestionResult) {
                  item.llmPropertiesSuggestionResult.forEach((result) => {
                    if (result.new_property === false) {
                      result.selected = true;
                    }
                  });
                }
              });
              console.log(
                'Updated selectedSuggestedMappingClassProperties with mapped results:',
                this.selectedSuggestedMappingClassProperties,
              );
              // Concatenate all logs from propertiesSuggestionResults
              this.selectedSuggestedMappingClassPropertiesView =
                this.propertiesSuggestionResults
                  .map((res: LLMPropertiesSuggestionResponse) => res.log)
                  .join('\n\n---\n\n');
              // if (result.errors.length > 0) {
              //   console.warn(
              //     'Some properties failed to process:',
              //     result.errors
              //   );
              //   alert(
              //     `${result.success.length} succeeded, ${result.errors.length} failed. Check console for details.`
              //   );
              // }
            }
          },
          error: (error) => {
            console.error('Error suggesting properties with LLM:', error);
            alert('Failed to suggest properties. Please try again.');
            this.loadingPropertiesSuggestion = false;
          },
          complete: () => {
            this.loadingPropertiesSuggestion = false;
          },
        });
    } catch (error) {
      console.error('Error suggesting properties with LLM:', error);
      alert('Failed to suggest properties. Please try again.');
      this.loadingPropertiesSuggestion = false;
    }
  }

  /**
   * Check if there are any properties suggestion results
   */
  hasPropertiesSuggestionResults(): boolean {
    return this.selectedSuggestedMappingClassProperties.some(
      (item) =>
        item.llmPropertiesSuggestionResult &&
        item.llmPropertiesSuggestionResult.length > 0,
    );
  }

  onPropertySelectionChange(): void {
    console.log(
      'Property selection changed',
      this.selectedSuggestedMappingClassProperties,
    );
  }

  onPropertySuggestionChange(
    indexI: number,
    indexJ: number,
    properties: any,
    event: any,
  ): void {}

  removePropertySuggestion(indexI: number, indexJ: number): void {}

  toggleAllPropertiesMappingsSelection(event: any): void {
    const isChecked = event.target.checked;
    this.selectedSuggestedMappingClassProperties.forEach((item) => {
      item.selected = isChecked;
      if (item.llmPropertiesSuggestionResult) {
        item.llmPropertiesSuggestionResult.forEach((result) => {
          result.selected = isChecked;
        });
      }
    });
  }

  toggleClassPropertiesSelection(indexI: number, event: any): void {
    const isChecked = event.target.checked;
    const classMapping = this.selectedSuggestedMappingClassProperties[indexI];
    if (classMapping.llmPropertiesSuggestionResult) {
      classMapping.llmPropertiesSuggestionResult.forEach((result) => {
        result.selected = isChecked;
      });
    }
    console.log(
      'Property selection changed',
      this.selectedSuggestedMappingClassProperties,
    );
  }

  private syncAllPropertiesSelectionState(): void {
    this.allPropertiesSelected =
      this.selectedSuggestedMappingClassProperties.every((item) => {
        if (item.llmPropertiesSuggestionResult) {
          return item.llmPropertiesSuggestionResult.every(
            (result) => result.selected,
          );
        }
        return false;
      });
  }

  areAllPropertiesMappingsSelected(): boolean {
    if (
      !this.selectedSuggestedMappingClassProperties ||
      this.selectedSuggestedMappingClassProperties.length === 0
    ) {
      return false;
    }
    return this.selectedSuggestedMappingClassProperties.every(
      (mappingProperties) =>
        mappingProperties.llmPropertiesSuggestionResult!.every(
          (prop) => prop.selected,
        ),
    );
  }

  areAllSuggestionPropertiesSelected(indexI: number): boolean {
    const classMapping = this.selectedSuggestedMappingClassProperties[indexI];
    if (!classMapping || !classMapping.llmPropertiesSuggestionResult) {
      return false;
    }
    return classMapping.llmPropertiesSuggestionResult.every(
      (prop) => prop.selected,
    );
  }

  areSomePropertiesMappingsSelected(): boolean {
    if (
      !this.selectedSuggestedMappingClassProperties ||
      this.selectedSuggestedMappingClassProperties.length === 0
    ) {
      return false;
    }
    const selectedCount = this.selectedSuggestedMappingClassProperties.filter(
      (mappingProperties) =>
        mappingProperties.llmPropertiesSuggestionResult!.some(
          (prop) => prop.selected,
        ),
    ).length;
    return (
      selectedCount > 0 &&
      selectedCount < this.selectedSuggestedMappingClassProperties.length
    );
  }

  areSomeSuggestionPropertiesSelected(indexI: number): boolean {
    const classMapping = this.selectedSuggestedMappingClassProperties[indexI];
    if (!classMapping || !classMapping.llmPropertiesSuggestionResult) {
      return false;
    }
    const selectedCount = classMapping.llmPropertiesSuggestionResult!.filter(
      (prop) => prop.selected,
    ).length;
    return (
      selectedCount > 0 &&
      selectedCount < classMapping.llmPropertiesSuggestionResult!.length
    );
  }

  // Method to get count of selected Properties mappings
  getPropertiesSelectedMappingsCount(): number {
    if (
      !this.selectedSuggestedMappingClassProperties ||
      this.selectedSuggestedMappingClassProperties.length === 0
    ) {
      return 0;
    }
    return this.selectedSuggestedMappingClassProperties.reduce(
      (count, mapping) =>
        count +
        mapping.llmPropertiesSuggestionResult!.filter((prop) => prop.selected)
          .length,
      0,
    );
  }

  // Method to get count of all Properties mappings
  getPropertiesMappingsCount(): number {
    if (
      !this.selectedSuggestedMappingClassProperties ||
      this.selectedSuggestedMappingClassProperties.length === 0
    ) {
      return 0;
    }
    return this.selectedSuggestedMappingClassProperties.reduce(
      (count, mapping) => count + mapping.llmPropertiesSuggestionResult!.length,
      0,
    );
  }

  writeMappingFile(): void {
    if (
      !this.selectedSuggestedMappingClassProperties ||
      this.selectedSuggestedMappingClassProperties.length === 0
    ) {
      this.errorWriteMapping = 'No mapping data available to write.';
      return;
    }

    if (!this.ontologyFile) {
      this.errorWriteMapping = 'Please select an ontology file (.ttl format).';
      return;
    }

    // Check if any properties are selected
    const hasSelectedProperties =
      this.selectedSuggestedMappingClassProperties.some((item) =>
        item.llmPropertiesSuggestionResult?.some((prop) => prop.selected),
      );

    if (!hasSelectedProperties) {
      this.errorWriteMapping =
        'Please select at least one property to write mapping.';
      return;
    }

    this.loadingWriteMapping = true;
    this.errorWriteMapping = null;
    this.successWriteMapping = null;
    this.writeMappingResult = '';

    try {
      console.log('Writing mapping data to backend:', {
        mappingData: this.selectedSuggestedMappingClassProperties,
        ontologyFile: this.ontologyFile.name,
      });

      this.autoMappingService
        .writeMappingDataEnhanced(
          this.selectedSuggestedMappingClassProperties,
          this.ontologyFile!,
          this.isDataSourceCSV,
        )
        .subscribe({
          next: (response) => {
            console.log('Mapping write completed:', response);

            this.successWriteMapping = response.message;
            this.writeMappingResult = response.result;

            console.log('R2RML Result:', response.result);
            console.log(
              `Successfully processed ${response.mappingCount} property mappings`,
            );

            // Optional: Save result to local storage or display in UI
            this.saveWriteMappingResult(response.result);

            // alert(
            //   `Mapping written successfully! Generated R2RML with ${response.mappingCount} property mappings.`
            // );
          },
          error: (error) => {
            console.error('Error writing mapping:', error);
            this.errorWriteMapping =
              error.error?.error ||
              error.message ||
              'Failed to write mapping data.';
            // alert('Failed to write mapping data. Please try again.');
          },
          complete: () => {
            this.loadingWriteMapping = false;
          },
        });
    } catch (error) {
      console.error('Error during mapping write:', error);
      this.errorWriteMapping = 'An error occurred while writing mapping data.';
      this.loadingWriteMapping = false;
    }
  }

  /**
   * Save write mapping result for later use
   */
  private saveWriteMappingResult(r2rmlResult: string) {
    try {
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('latest-r2rml-mapping', r2rmlResult);
        localStorage.setItem(
          'latest-r2rml-timestamp',
          new Date().toISOString(),
        );
      }
    } catch (error) {
      console.warn('Failed to save R2RML result to localStorage:', error);
    }
  }

  /**
   * Get saved write mapping result
   */
  getSavedWriteMappingResult(): string | null {
    try {
      if (isPlatformBrowser(this.platformId)) {
        return localStorage.getItem('latest-r2rml-mapping');
      }
    } catch (error) {
      console.warn('Failed to get saved R2RML result:', error);
    }
    return null;
  }

  /**
   * Download R2RML result as file
   */
  downloadR2RMLResult() {
    if (!this.writeMappingResult) {
      alert('No R2RML result available to download.');
      return;
    }

    try {
      const blob = new Blob([this.writeMappingResult], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `r2rml-mapping-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/:/g, '-')}.ttl`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading R2RML result:', error);
      alert('Failed to download R2RML result.');
    }
  }

  /**
   * Clear write mapping results
   */
  clearWriteMappingResults() {
    this.writeMappingResult = '';
    this.errorWriteMapping = null;
    this.successWriteMapping = null;

    try {
      if (isPlatformBrowser(this.platformId)) {
        localStorage.removeItem('latest-r2rml-mapping');
        localStorage.removeItem('latest-r2rml-timestamp');
      }
    } catch (error) {
      console.warn('Failed to clear saved R2RML results:', error);
    }
  }

  /**
   * Send schema summary to backend
   */
  async postFilesSchemaSummary() {
    this.loadingSummary = true;
    this.errorSchema = null;
    this.successSchema = null;

    try {
      // Validate data availability
      if (!this.termsSuggestion || this.termsSuggestion.length === 0) {
        this.errorSchema =
          'No terms suggestion available. Please process your schema first.';
        this.loadingSummary = false;
        return;
      }

      if (
        !this.flatExportedOntologySchemaData ||
        this.flatExportedOntologySchemaData.length === 0
      ) {
        this.errorSchema =
          'No ontology schema available. Please load your ontology file first.';
        this.loadingSummary = false;
        return;
      }

      console.log('Sending schema summary to backend...');
      console.log('Terms Suggestion:', this.termsSuggestion);
      console.log('Ontology Schema:', this.flatExportedOntologySchemaData);

      this.autoMappingService
        .sendSchemaSummaryEnhanced(
          this.termsSuggestion,
          this.flatExportedOntologySchemaData,
        )
        .subscribe({
          next: (response) => {
            console.log('Schema summary sent successfully:', response);

            this.successSchema = response.message;
            this.globalSchemaSummary = JSON.stringify(
              response.summary,
              null,
              2,
            );

            // Display statistics
            console.log('Global Schema Summary:', response.summary);

            this.loadingSummary = false;
          },
          error: (error) => {
            console.error('Error sending schema summary:', error);
            this.errorSchema =
              error.error?.error ||
              error.message ||
              'Failed to send schema summary.';
            this.loadingSummary = false;
          },
        });
    } catch (error) {
      console.error('Error during schema summary process:', error);
      this.errorSchema = 'An error occurred while processing schema summary.';
      this.loadingSummary = false;
    }
  }

  /**
   * Get schema summary preview without sending to backend
   * @returns Schema summary object
   */
  getSchemaSummaryPreview(): SchemaSummaryRequest | null {
    if (!this.termsSuggestion || !this.flatExportedOntologySchemaData) {
      return null;
    }

    // Generate tables structure
    const tables: TableSummaryStructure = {};
    const tableGroups = new Map<string, Term[]>();

    // Group terms by table
    this.termsSuggestion.forEach((term) => {
      const tableName = term.improved_table_name || term.table_name;
      if (!tableGroups.has(tableName)) {
        tableGroups.set(tableName, []);
      }
      tableGroups.get(tableName)!.push(term);
    });

    // Format table structure
    tableGroups.forEach((terms, tableName) => {
      tables[tableName] = terms.map((term) => {
        const columnName = term.improved_column_name || term.column_name;
        const parts = [columnName];

        // Check if it's a primary key (you may need to add this logic)
        // if (term.is_primary_key) parts.push('(PK)');

        // Add data type
        if (term.data_type) parts.push(`(${term.data_type})`);

        // Add foreign key relationship
        if (term.related_table) parts.push(`(FK -> ${term.related_table})`);

        return parts.join(' ');
      });
    });

    // Generate ontology structure
    const ontology: OntologyClassSummary = {};

    this.flatExportedOntologySchemaData.forEach((schema) => {
      const className = schema.label;
      const properties: string[] = [];

      // Add data properties
      schema.dataProperties.forEach((dataProp) => {
        properties.push(dataProp.name);
      });

      // Add object properties
      schema.objectProperties.forEach((objProp) => {
        properties.push(`${objProp.name} -> ${objProp.range}`);
      });

      if (properties.length > 0) {
        ontology[className] = properties;
      }
    });

    return { tables, ontology };
  }

  /**
   * Display schema summary preview in console
   */
  previewSchemaSummary() {
    const summary = this.getSchemaSummaryPreview();
    this.globalSchemaSummary = JSON.stringify(summary, null, 2);
    if (summary) {
      console.log('Schema Summary Preview:');
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.warn('No data available for preview');
    }
  }

  private loadGlobalSchemaSummary() {
    if (
      this.flatExportedOntologySchemaData.length > 0 &&
      this.termsSuggestion.length > 0
    ) {
      const summary = this.getSchemaSummaryPreview();
      this.globalSchemaSummary = JSON.stringify(summary, null, 2);
    }
  }

  onDataSourceTypeChange(event: any) {
    this.isDataSourceCSV = event.target.checked;
    console.log(
      'Data source type changed:',
      this.isDataSourceCSV ? 'CSV' : 'RDBMS',
    );

    // Optional: Save to localStorage
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(
          'isDataSourceCSV',
          JSON.stringify(this.isDataSourceCSV),
        );
      } catch (error) {
        console.warn('Failed to save data source type preference:', error);
      }
    }
  }

  // Add method to load saved preference in ngOnInit
  private loadDataSourceTypePreference() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const savedPreference = localStorage.getItem('isDataSourceCSV');
        if (savedPreference !== null) {
          this.isDataSourceCSV = JSON.parse(savedPreference);
        }
      } catch (error) {
        console.warn('Failed to load data source type preference:', error);
      }
    }
  }
}
