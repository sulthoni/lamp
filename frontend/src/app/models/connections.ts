export interface DatabaseConnection {
  id?: string;
  name: string;
  type: 'mysql' | 'mssql' | 'postgresql' | 'oracle';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  driverClass?: string;
  databaseName?: string;
  connectionName?: string;
}

export interface ColumnStructure {
  name: string;
  type: string;
  null: string;
  key: string;
  default: any;
  extra: string;
  relatedTable?: ColumnStructure[]; //if foreign key, relate to another table
  selected: boolean;
  data?: any[]; // Sample data for the column
}

export interface TableStructures {
  [tableName: string]: ColumnStructure[];
}

// Add this interface to the connections.ts file or create a new interface
export interface ForeignKeyInfo {
  columnName: string;
  referencedTableName: string;
  referencedColumnName: string;
  constraintName: string;
}
