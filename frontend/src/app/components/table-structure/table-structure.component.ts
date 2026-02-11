import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { saveAs } from 'file-saver'; // Add this import (install with: npm install file-saver)
import {
  ColumnStructure,
  DatabaseConnection,
  ForeignKeyInfo,
  TableStructures,
} from '../../models/connections';
import { ConnectionService } from '../../services/connection.service';

@Component({
  selector: 'app-table-structure',
  imports: [CommonModule, DragDropModule, FormsModule],
  templateUrl: './table-structure.component.html',
  styleUrl: './table-structure.component.css',
})
export class TableStructureComponent implements OnInit {
  connections: DatabaseConnection[] = [];
  tableStructures: TableStructures = {};
  tableNames: string[] = [];
  currentConnectionId: string | null = null;
  csvFiles: File[] = []; // New property to hold CSV files

  constructor(
    private http: HttpClient,
    private connectionService: ConnectionService
  ) {}

  ngOnInit() {
    this.connections[0] = {
      id: '0',
      name: 'Select Connection',
      type: 'mysql',
      host: '0.0.0.0',
      port: 0,
      database: '-',
      username: '-',
      password: '-',
    };
    this.fetchConnections();
  }

  fetchConnections() {
    this.connectionService.getConnections().subscribe({
      next: (data) => {
        this.connections.push(...data);
      },
      error: (err) => {
        console.error('Error fetching connections', err);
      },
    });
  }

  async onConnectionChange(event: any) {
    const connectionId = await event.target.value;
    this.currentConnectionId = connectionId;

    if (connectionId === '0') {
      // No database connection selected, keep only CSV structures
      this.clearDatabaseTableStructures();
      this.extractTableStructuresFromCsv(); // Re-extract CSV structures
    } else {
      this.fetchTableStructures(connectionId);
    }
  }

  fetchTableStructures(connectionId: String) {
    this.connectionService.getTableStructure(connectionId!).subscribe({
      next: async (data) => {
        // Merge database structures with existing CSV structures
        const csvTableNames = this.csvFiles.map((file) =>
          this.getTableNameFromFile(file.name)
        );
        const mergedStructures: TableStructures = { ...data };

        // Preserve CSV structures
        csvTableNames.forEach((tableName) => {
          if (this.tableStructures[tableName]) {
            mergedStructures[tableName] = this.tableStructures[tableName];
          }
        });

        this.tableStructures = mergedStructures;

        // Fetch sample data and foreign key relationships for database tables
        await this.enrichDatabaseTableStructures(connectionId);

        this.updateTableNames();
      },
      error: (err) => {
        console.error('Error fetching table structures', err);
      },
    });
  }

  /**
   * Enrich database table structures with sample data and foreign key relationships
   */
  private async enrichDatabaseTableStructures(
    connectionId: String
  ): Promise<void> {
    try {
      // Get list of database tables (exclude CSV tables)
      const csvTableNames = this.csvFiles.map((file) =>
        this.getTableNameFromFile(file.name)
      );
      const databaseTableNames = Object.keys(this.tableStructures).filter(
        (tableName) => !csvTableNames.includes(tableName)
      );

      // Process each database table
      for (const tableName of databaseTableNames) {
        await this.enrichTableStructure(connectionId, tableName);
      }
    } catch (error) {
      console.error('Error enriching database table structures:', error);
    }
  }

  /**
   * Enrich a single table structure with sample data and foreign key relationships
   */
  private async enrichTableStructure(
    connectionId: String,
    tableName: string
  ): Promise<void> {
    try {
      // Fetch sample data for the table
      const sampleData = await this.fetchSampleData(connectionId, tableName);

      // Fetch foreign key relationships for the table
      const foreignKeys = await this.fetchForeignKeys(connectionId, tableName);

      // Update column structures with sample data and children
      if (this.tableStructures[tableName]) {
        this.tableStructures[tableName].forEach((column) => {
          // Add sample data for this column
          column.data = this.extractColumnSampleData(sampleData, column.name);

          // Add children (foreign key relationships)
          const foreignKey = foreignKeys.find(
            (fk) => fk.columnName === column.name
          );
          if (foreignKey) {
            column.relatedTable = this.createForeignKeyChildren(foreignKey);
          }
        });
      }
    } catch (error) {
      console.error(`Error enriching table structure for ${tableName}:`, error);
    }
  }

  /**
   * Fetch sample data for a table (first 10 rows)
   */
  private fetchSampleData(
    connectionId: String,
    tableName: string
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.connectionService
        .getSampleData(connectionId, tableName, 10)
        .subscribe({
          next: (data) => resolve(data),
          error: (err) => {
            console.error(`Error fetching sample data for ${tableName}:`, err);
            resolve([]); // Return empty array on error
          },
        });
    });
  }

  /**
   * Fetch foreign key relationships for a table
   */
  private fetchForeignKeys(
    connectionId: String,
    tableName: string
  ): Promise<ForeignKeyInfo[]> {
    return new Promise((resolve, reject) => {
      this.connectionService.getForeignKeys(connectionId, tableName).subscribe({
        next: (data) => resolve(data),
        error: (err) => {
          console.error(`Error fetching foreign keys for ${tableName}:`, err);
          resolve([]); // Return empty array on error
        },
      });
    });
  }

  /**
   * Extract sample data for a specific column
   */
  private extractColumnSampleData(
    sampleData: any[],
    columnName: string
  ): any[] {
    return sampleData
      .map((row) => row[columnName])
      .filter((val) => val !== null && val !== undefined)
      .slice(0, 10);
  }

  /**
   * Create foreign key children structure
   */
  private createForeignKeyChildren(
    foreignKey: ForeignKeyInfo
  ): ColumnStructure[] {
    return [
      {
        name: foreignKey.referencedColumnName,
        type: 'REFERENCE',
        null: 'NO',
        key: 'FK',
        default: null,
        extra: `References ${foreignKey.referencedTableName}`,
        selected: false,
        data: [], // Sample data would need to be fetched from referenced table
        relatedTable: undefined,
      },
    ];
  }

  drop(event: CdkDragDrop<ColumnStructure[]>, tableName: string) {
    if (event.previousContainer === event.container) {
      moveItemInArray(
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
  }

  extractTableStructure() {
    // Include all table structures with sample data and children
    const enrichedTableStructures: { [tableName: string]: any[] } = {};

    Object.keys(this.tableStructures).forEach((tableName) => {
      enrichedTableStructures[tableName] = this.tableStructures[tableName].map(
        (column) => ({
          name: column.name,
          type: column.type,
          null: column.null,
          key: column.key,
          default: column.default,
          extra: column.extra,
          selected: column.selected,
          data: column.data || [], // Include sample data
          relatedTable: column.relatedTable || [], // Include foreign key relationships
        })
      );
    });

    this.connectionService
      .saveTableStructure(enrichedTableStructures, { responseType: 'blob' })
      .subscribe({
        next: (file: Blob) => {
          // Prompt user to save the file
          saveAs(file, 'table-structure.json');
        },
        error: (err) => {
          alert('Failed to export table structure.');
        },
      });
  }

  toggleSelectAll(tableName: string, selectStatus: boolean) {
    this.tableStructures[tableName].forEach((column) => {
      column.selected = selectStatus;
    });
  }

  exportAllSelectedColumns() {
    // Prepare an object with selected columns for all tables
    const exportData: { [tableName: string]: any[] } = {};

    // Collect selected columns for each table
    Object.keys(this.tableStructures).forEach((tableName) => {
      const selectedColumns = this.tableStructures[tableName]
        .filter((column) => column.selected)
        .map((column) => ({
          name: column.name,
          type: column.type,
          null: column.null,
          key: column.key,
          default: column.default,
          extra: column.extra,
          data: column.data || [], // Include sample data
          relatedTable: column.relatedTable || [], // Include foreign key relationships
        }));

      // Only add tables with selected columns
      if (selectedColumns.length > 0) {
        exportData[tableName] = selectedColumns;
      }
    });

    // Adjusted: Expect a file (Blob) from backend
    this.connectionService
      .saveTableStructure(exportData, { responseType: 'blob' })
      .subscribe({
        next: (file: Blob) => {
          // Prompt user to save the file
          saveAs(file, 'table-structure.json');
        },
        error: (err) => {
          alert('Failed to export table structure.');
        },
      });
  }

  onAddCsvFile(event: Event) {
    const input = event.target as HTMLInputElement;

    if (input.files) {
      const files = Array.from(input.files); // Convert FileList to an array
      files.forEach((file) => {
        // Avoid adding duplicate files
        if (
          !this.csvFiles.some((existingFile) => existingFile.name === file.name)
        ) {
          this.csvFiles.push(file);
        }
      });
    }

    // Reset the input value to allow re-adding the same file if needed
    (event.target as HTMLInputElement).value = '';

    // Extract table structures from CSV files
    this.extractTableStructuresFromCsv();
  }

  onRemoveCsvFile(index: number) {
    // Remove the file at the specified index
    this.csvFiles.splice(index, 1);

    // Re-extract table structures after removing file
    this.extractTableStructuresFromCsv();
  }

  /**
   * Extract table structures from CSV files
   */
  private async extractTableStructuresFromCsv(): Promise<void> {
    // Clear existing CSV-based table structures
    this.clearCsvTableStructures();

    if (this.csvFiles.length === 0) {
      return;
    }

    try {
      // Process each CSV file
      for (const file of this.csvFiles) {
        await this.processCsvFile(file);
      }

      // Update table names after processing all files
      this.updateTableNames();
    } catch (error) {
      console.error('Error extracting table structures from CSV files:', error);
    }
  }

  /**
   * Process a single CSV file and extract its structure
   */
  private processCsvFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const csv = e.target?.result as string;
          const structure = this.parseCSVStructure(csv, file.name);

          // Use filename without extension as table name
          const tableName = this.getTableNameFromFile(file.name);
          this.tableStructures[tableName] = structure;

          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error(`Failed to read file: ${file.name}`));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Parse CSV content and return column structures
   */
  private parseCSVStructure(
    csvContent: string,
    fileName: string
  ): ColumnStructure[] {
    // Handle different line ending formats: \r\n (Windows), \n (Unix), \r (old Mac)
    const lines = csvContent
      .split(/\r?\n|\r/) // Split on any line ending format
      .filter((line) => line.trim() !== '');

    if (lines.length === 0) {
      return [];
    }

    // Get headers from first line
    const headers = this.parseCSVLine(lines[0]);

    // Sample data from next few lines to determine types (up to 10 rows for sample data)
    const sampleLines = lines.slice(1, Math.min(11, lines.length)); // Take up to 10 sample rows
    const sampleData = sampleLines.map((line) => this.parseCSVLine(line));

    // Create column structures
    const columns: ColumnStructure[] = headers.map((header, index) => {
      const columnValues = sampleData
        .map((row) => row[index])
        .filter((val) => val !== undefined && val !== '');
      const dataType = this.inferDataType(columnValues);

      // Get sample data for this column (first 10 values)
      const sampleColumnData = sampleData
        .map((row) => row[index])
        .filter((val) => val !== undefined && val !== '')
        .slice(0, 10);

      return {
        name: header.trim(),
        type: dataType,
        null: 'YES', // CSV columns can generally be null
        key: '', // No primary key info from CSV
        default: null,
        extra: '',
        selected: false, // Default to not selected
        data: sampleColumnData, // Add sample data
        relatedTable: undefined, // CSV files don't have foreign key relationships
      };
    });

    return columns;
  }

  /**
   * Parse a CSV line handling quoted values and commas
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last field
    result.push(current);

    return result;
  }

  /**
   * Infer data type from sample values
   */
  private inferDataType(values: string[]): string {
    if (values.length === 0) {
      return 'VARCHAR(255)';
    }

    // Check if all values are integers
    const allIntegers = values.every((val) => /^-?\d+$/.test(val.trim()));
    if (allIntegers) {
      const maxValue = Math.max(
        ...values.map((val) => Math.abs(parseInt(val.trim())))
      );
      if (maxValue <= 127) return 'TINYINT';
      if (maxValue <= 32767) return 'SMALLINT';
      if (maxValue <= 2147483647) return 'INT';
      return 'BIGINT';
    }

    // Check if all values are decimals
    const allDecimals = values.every((val) => /^-?\d*\.?\d+$/.test(val.trim()));
    if (allDecimals) {
      return 'DECIMAL(10,2)';
    }

    // Check if all values are dates
    const allDates = values.every((val) => {
      const date = new Date(val.trim());
      return !isNaN(date.getTime()) && val.trim().length >= 8;
    });
    if (allDates) {
      // Check if it includes time
      const hasTime = values.some((val) => val.includes(':'));
      return hasTime ? 'DATETIME' : 'DATE';
    }

    // Check if all values are booleans
    const allBooleans = values.every((val) =>
      ['true', 'false', '1', '0', 'yes', 'no'].includes(
        val.trim().toLowerCase()
      )
    );
    if (allBooleans) {
      return 'BOOLEAN';
    }

    // Default to VARCHAR with appropriate length
    const maxLength = Math.max(...values.map((val) => val.length));
    if (maxLength <= 50) return 'VARCHAR(50)';
    if (maxLength <= 255) return 'VARCHAR(255)';
    if (maxLength <= 1000) return 'VARCHAR(1000)';
    return 'TEXT';
  }

  /**
   * Get table name from file name (remove extension)
   */
  private getTableNameFromFile(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, ''); // Remove file extension
  }

  /**
   * Clear CSV-based table structures (keep database-based ones)
   */
  private clearCsvTableStructures(): void {
    // If we have a current connection, preserve database tables
    if (this.currentConnectionId && this.currentConnectionId !== '0') {
      // Keep only database tables, remove CSV tables
      const csvTableNames = this.csvFiles.map((file) =>
        this.getTableNameFromFile(file.name)
      );
      csvTableNames.forEach((tableName) => {
        delete this.tableStructures[tableName];
      });
    } else {
      // No database connection, clear all
      this.tableStructures = {};
    }
  }

  /**
   * Clear database-based table structures (keep CSV-based ones)
   */
  private clearDatabaseTableStructures(): void {
    const csvTableNames = this.csvFiles.map((file) =>
      this.getTableNameFromFile(file.name)
    );
    const newTableStructures: TableStructures = {};

    // Keep only CSV tables
    csvTableNames.forEach((tableName) => {
      if (this.tableStructures[tableName]) {
        newTableStructures[tableName] = this.tableStructures[tableName];
      }
    });

    this.tableStructures = newTableStructures;
    this.updateTableNames();
  }

  /**
   * Update table names array
   */
  private updateTableNames(): void {
    this.tableNames = Object.keys(this.tableStructures);
  }

  /**
   * Format file size in human readable format
   */
  getFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
