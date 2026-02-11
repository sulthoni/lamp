import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DatabaseConnection } from '../../models/connections';
import { ConnectionService } from '../../services/connection.service';
import { GraphdbService } from '../../services/graphdb.service';

interface Repository {
  id: string;
  title: string;
  location: string;
}

@Component({
  selector: 'app-publish',
  imports: [CommonModule, ReactiveFormsModule, FormsModule], // Add FormsModule
  templateUrl: './publish.component.html',
  styleUrl: './publish.component.css',
})
export class PublishComponent implements OnInit {
  repositories: Repository[] = [];
  repositoryForm: FormGroup;
  turtleFile: File | null = null;
  turtleFileLocation: string | null = null;
  r2rmlFile: File | null = null;
  r2rmlFileLocation: string | null = null;
  connectionTestedFileLocation: string | null = null;
  configFileLocation: string | null = null;
  loading = false;
  successMessage = '';
  errorMessage = '';

  testingConnection = false;
  testConnectionResult: { success: boolean; message: string } | null = null;

  loadingStep: string = '';

  // Add these properties
  savedConnections: DatabaseConnection[] = [];
  selectedConnectionId: string = '';
  loadingConnections = false;

  constructor(
    private graphDBService: GraphdbService,
    private fb: FormBuilder,
    private connectionService: ConnectionService // Add this
  ) {
    this.repositoryForm = this.fb.group({
      repositoryId: [
        '',
        [Validators.required, Validators.pattern('[a-zA-Z0-9-_]+')],
      ],
      title: ['', Validators.required],
      jdbcDriver: ['com.mysql.jdbc.Driver', Validators.required], // Default to MySQL
      jdbcUrl: ['', Validators.required],
      dbUsername: ['', Validators.required],
      dbPassword: ['', Validators.required],
      dbName: ['', Validators.required],
    });
  }

  ngOnInit() {
    this.loadRepositories();
    this.loadSavedConnections(); // Add this
  }

  loadRepositories() {
    this.loading = true;
    this.graphDBService.getRepositories().subscribe({
      next: (repos) => {
        this.repositories = repos;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = 'Error loading repositories: ' + error.message;
        this.loading = false;
      },
    });
  }

  // Add this method
  loadSavedConnections() {
    this.loadingConnections = true;
    this.connectionService.getConnections().subscribe({
      next: (connections) => {
        this.savedConnections = connections;
        this.loadingConnections = false;
      },
      error: (error) => {
        console.error('Error loading saved connections:', error);
        this.errorMessage = 'Failed to load saved connections';
        this.loadingConnections = false;
      },
    });
  }

  onTurtleFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.turtleFile = file;

      // Prepare FormData for file upload
      const formData = new FormData();
      formData.append('file', file);

      // Send to GraphDB server
      this.graphDBService.uploadFileToGraphDB(formData).subscribe({
        next: (response) => {
          if (response.success) {
            this.turtleFileLocation = response.fileLocation || null;
          } else {
            this.turtleFileLocation = null;
            this.errorMessage =
              response.errorMessage || 'Failed to upload ontology file.';
          }
        },
        error: (error) => {
          this.turtleFileLocation = null;
          this.errorMessage =
            error.error?.errorMessage || 'Failed to upload ontology file.';
        },
      });
    }
  }

  onR2RMLFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.r2rmlFile = file;

      // Prepare FormData for file upload
      const formData = new FormData();
      formData.append('file', file);

      // Send to GraphDB server
      this.graphDBService.uploadFileToGraphDB(formData).subscribe({
        next: (response) => {
          if (response.success) {
            this.r2rmlFileLocation = response.fileLocation || null;
          } else {
            this.r2rmlFileLocation = null;
            this.errorMessage =
              response.errorMessage || 'Failed to upload R2RML file.';
          }
        },
        error: (error) => {
          this.r2rmlFileLocation = null;
          this.errorMessage =
            error.error?.errorMessage || 'Failed to upload R2RML file.';
        },
      });
    }
  }

  onJdbcDriverChange() {
    const driver = this.repositoryForm.get('jdbcDriver')?.value;
    const dbName = this.repositoryForm.get('dbName')?.value || 'dbname';
    let jdbcUrl = '';

    switch (driver) {
      case 'org.postgresql.Driver':
        jdbcUrl = `jdbc:postgresql://localhost:5432/${dbName}`;
        break;
      case 'com.mysql.jdbc.Driver':
        jdbcUrl = `jdbc:mysql://localhost:3306/${dbName}`;
        break;
      case 'oracle.jdbc.driver.OracleDriver':
        jdbcUrl = `jdbc:oracle:thin:@localhost:1521:${dbName}`;
        break;
      case 'com.microsoft.sqlserver.jdbc.SQLServerDriver':
        jdbcUrl = `jdbc:sqlserver://localhost:1433;databaseName=${dbName}`;
        break;
      default:
        jdbcUrl = '';
    }

    this.repositoryForm.patchValue({ jdbcUrl });
  }

  async createRepository() {
    if (this.repositoryForm.valid && this.r2rmlFile) {
      this.loading = true;
      this.errorMessage = '';
      this.successMessage = '';

      const formValue = this.repositoryForm.value;

      try {
        // Step 1: Create config file
        console.log('Step 1: Creating config file...');
        this.loadingStep = 'Creating configuration file...';
        await this.createConfigFile();

        if (!this.configFileLocation) {
          throw new Error('Failed to create config file');
        }

        // Step 2: Create Ontop repository using the config file
        console.log('Step 2: Creating Ontop repository...');
        this.loadingStep = 'Creating Ontop repository...';
        await this.createOntopRepositoryWithConfig(formValue);

        this.loadingStep = '';
        this.successMessage = 'Repository created successfully!';
        this.loadRepositories();
        this.resetForm();
      } catch (error: any) {
        this.loadingStep = '';
        console.error('Error creating repository:', error);
        this.errorMessage = `Error creating repository: ${
          error.error?.errorMessage || error.message || 'Unknown error'
        }`;
      } finally {
        this.loading = false;
      }
    } else {
      this.validateFormInputs();
    }
  }

  private async createConfigFile(): Promise<void> {
    const formValue = this.repositoryForm.value;

    // Parse connection details from form
    const url = formValue.jdbcUrl;
    let hostName = 'localhost';
    let port = 3306;
    let databaseName = formValue.dbName || '';
    let driverClass = formValue.jdbcDriver;
    let userName = formValue.dbUsername;
    let password = formValue.dbPassword;
    let additionalProperties = '';
    let dbtype = '';

    // Parse host, port, and database from JDBC URL
    try {
      const urlMatch = url.match(/\/\/([^:/]+)(?::(\d+))?\/([^?;]+)/);
      if (urlMatch) {
        hostName = urlMatch[1];
        port = urlMatch[2]
          ? parseInt(urlMatch[2], 10)
          : this.getDefaultPort(driverClass);
        databaseName = urlMatch[3];
        dbtype = this.getDbType(driverClass);
      }
    } catch (parseError) {
      console.warn('Error parsing JDBC URL:', parseError);
    }

    // Use new MySQL driver if old one is selected
    if (driverClass === 'com.mysql.jdbc.Driver') {
      driverClass = 'com.mysql.cj.jdbc.Driver';
    }

    const configPayload = {
      hostName,
      port,
      databaseName,
      userName,
      password,
      driverClass,
      url,
      additionalProperties,
    };

    console.log('Creating config with payload:', configPayload);

    return new Promise((resolve, reject) => {
      this.graphDBService
        .createConfigFile(
          configPayload,
          dbtype,
          this.connectionTestedFileLocation
        )
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.configFileLocation = response.fileLocation;
              console.log('Config file created:', this.configFileLocation);
              resolve();
            } else {
              reject(
                new Error(
                  response.errorMessage || 'Failed to create config file'
                )
              );
            }
          },
          error: (error) => {
            console.error('Error creating config file:', error);
            reject(error);
          },
        });
    });
  }

  private async createOntopRepositoryWithConfig(formValue: any): Promise<void> {
    const repositoryConfig = {
      id: formValue.repositoryId,
      params: {
        propertiesFile: {
          name: 'propertiesFile',
          label: 'JDBC properties file',
          value: this.configFileLocation || '',
        },
        lensesFile: {
          name: 'lensesFile',
          label: 'Lenses file',
          value: '',
        },
        isShacl: {
          name: 'isShacl',
          label: 'Enable SHACL validation',
          value: 'false',
        },
        owlFile: {
          name: 'owlFile',
          label: 'Ontology file',
          value: this.turtleFileLocation || '',
        },
        constraintFile: {
          name: 'constraintFile',
          label: 'Constraint file',
          value: '',
        },
        id: {
          name: 'id',
          label: 'Repository ID',
          value: formValue.repositoryId,
        },
        title: {
          name: 'title',
          label: 'Repository description',
          value: formValue.title,
        },
        obdaFile: {
          name: 'obdaFile',
          label: 'OBDA or R2RML file',
          value: this.r2rmlFileLocation || '',
        },
        dbMetadataFile: {
          name: 'dbMetadataFile',
          label: 'DB metadata file',
          value: '',
        },
      },
      title: formValue.title,
      type: 'ontop',
      location: '',
    };

    console.log('Creating repository with config:', repositoryConfig);

    return new Promise((resolve, reject) => {
      this.graphDBService.createOntopRepository(repositoryConfig).subscribe({
        next: (response) => {
          console.log('Repository created successfully:', response);
          resolve();
        },
        error: (error) => {
          console.error('Error creating Ontop repository:', error);
          reject(error);
        },
      });
    });
  }

  // Helper methods
  private getDefaultPort(driverClass: string): number {
    if (driverClass.includes('mysql')) return 3306;
    if (driverClass.includes('postgresql')) return 5432;
    if (driverClass.includes('sqlserver')) return 1433;
    if (driverClass.includes('oracle')) return 1521;
    return 3306;
  }

  private getDbType(driverClass: string): string {
    if (driverClass.includes('mysql')) return 'mySQL';
    if (driverClass.includes('postgresql')) return 'PostgreSQL';
    if (driverClass.includes('sqlserver')) return 'SQLServer';
    if (driverClass.includes('oracle')) return 'Oracle';
    return 'mySQL';
  }

  private resetForm(): void {
    this.repositoryForm.reset({
      jdbcDriver: 'com.mysql.jdbc.Driver',
    });
    this.turtleFile = null;
    this.r2rmlFile = null;
    this.turtleFileLocation = null;
    this.r2rmlFileLocation = null;
    this.configFileLocation = null;
    this.connectionTestedFileLocation = null;
  }

  private validateFormInputs(): void {
    if (!this.r2rmlFile) {
      this.errorMessage = 'Please provide an R2RML mapping file';
    } else if (!this.repositoryForm.valid) {
      this.errorMessage = 'Please fill in all required fields correctly';
    }

    // Additional validation for required file locations
    if (!this.connectionTestedFileLocation) {
      this.errorMessage = 'Please test the database connection first';
    }
  }

  testConnection() {
    this.testingConnection = true;
    this.testConnectionResult = null;

    const formValue = this.repositoryForm.value;
    // Parse host, port, dbName from jdbcUrl for payload
    const url = formValue.jdbcUrl;
    let hostName = 'localhost';
    let port = 3306;
    let databaseName = formValue.dbName || '';
    let driverClass = formValue.jdbcDriver;
    let userName = formValue.dbUsername;
    let password = formValue.dbPassword;
    let additionalProperties = '';
    let dbtype = '';

    // Simple parsing for MySQL/Postgres/SQLServer/Oracle
    try {
      const urlMatch = url.match(/\/\/([^:/]+)(?::(\d+))?\/([^?;]+)/);
      if (urlMatch) {
        hostName = urlMatch[1];
        port = urlMatch[2]
          ? parseInt(urlMatch[2], 10)
          : driverClass.includes('mysql')
          ? 3306
          : driverClass.includes('postgresql')
          ? 5432
          : driverClass.includes('sqlserver')
          ? 1433
          : driverClass.includes('oracle')
          ? 1521
          : 3306;
        databaseName = urlMatch[3];
        dbtype = this.getDbType(driverClass);
      }
    } catch {}

    // Use new MySQL driver if old one is selected
    if (driverClass === 'com.mysql.jdbc.Driver') {
      driverClass = 'com.mysql.cj.jdbc.Driver';
    }

    this.graphDBService
      .testDatabaseConnection({
        hostName,
        port,
        databaseName,
        userName,
        password,
        driverClass,
        url,
        additionalProperties,
        dbtype,
      })
      .subscribe({
        next: (result) => {
          this.testConnectionResult = {
            success: result.success,
            message:
              result.errorMessage ||
              (result.success
                ? 'Connection successful.'
                : 'Connection failed.'),
          };
          this.turtleFileLocation = result.fileLocation || null; // Save fileLocation
          this.testingConnection = false;
        },
        error: (error) => {
          this.testConnectionResult = {
            success: false,
            message:
              error.error?.errorMessage ||
              error.error?.message ||
              'Connection failed',
          };
          this.turtleFileLocation = null;
          this.testingConnection = false;
        },
      });
  }

  editRepository(repo: Repository) {
    // Implement edit functionality
    this.repositoryForm.patchValue({
      repositoryId: repo.id,
      title: repo.title,
    });
  }

  deleteRepository(repositoryId: string) {
    if (
      confirm(`Are you sure you want to delete repository ${repositoryId}?`)
    ) {
      this.loading = true;
      this.graphDBService.deleteRepository(repositoryId).subscribe({
        next: () => {
          this.successMessage = 'Repository deleted successfully!';
          this.loadRepositories();
        },
        error: (error) => {
          this.errorMessage = 'Error deleting repository: ' + error.message;
          this.loading = false;
        },
      });
    }
  }

  // Add this method
  onConnectionSelected() {
    if (!this.selectedConnectionId) {
      return;
    }

    const selectedConnection = this.savedConnections.find(
      (conn) => conn.id === this.selectedConnectionId
    );

    if (selectedConnection) {
      this.fillFormWithConnection(selectedConnection);
    }
  }

  // Add this method
  private fillFormWithConnection(connection: DatabaseConnection) {
    // Map the connection properties to form controls
    const jdbcUrl = this.buildJdbcUrl(connection);

    this.repositoryForm.patchValue({
      jdbcDriver: this.mapDriverClass(connection.driverClass!),
      jdbcUrl: jdbcUrl,
      dbUsername: connection.username,
      dbPassword: connection.password,
      dbName: connection.databaseName,
    });

    console.log('Form filled with connection:', connection.connectionName);
  }

  // Add this helper method
  private buildJdbcUrl(connection: DatabaseConnection): string {
    const { host, port, databaseName, driverClass } = connection;

    if (driverClass?.includes('mysql')) {
      return `jdbc:mysql://${host}:${port}/${databaseName}`;
    } else if (driverClass?.includes('postgresql')) {
      return `jdbc:postgresql://${host}:${port}/${databaseName}`;
    } else if (driverClass?.includes('oracle')) {
      return `jdbc:oracle:thin:@${host}:${port}:${databaseName}`;
    } else if (driverClass?.includes('sqlserver')) {
      return `jdbc:sqlserver://${host}:${port};databaseName=${databaseName}`;
    }

    return `jdbc:mysql://${host}:${port}/${databaseName}`; // default
  }

  // Add this helper method
  private mapDriverClass(driverClass: string): string {
    if (driverClass?.includes('mysql')) {
      return 'com.mysql.jdbc.Driver';
    } else if (driverClass?.includes('postgresql')) {
      return 'org.postgresql.Driver';
    } else if (driverClass?.includes('oracle')) {
      return 'oracle.jdbc.driver.OracleDriver';
    } else if (driverClass?.includes('sqlserver')) {
      return 'com.microsoft.sqlserver.jdbc.SQLServerDriver';
    }

    return 'com.mysql.jdbc.Driver'; // default
  }

  // Add this method to clear the selection
  clearConnectionSelection() {
    this.selectedConnectionId = '';
    this.repositoryForm.reset({
      jdbcDriver: 'com.mysql.jdbc.Driver',
    });
  }

  // Add this helper method to the component
  getSelectedConnection(): DatabaseConnection | undefined {
    return this.savedConnections.find(
      (conn) => conn.id === this.selectedConnectionId
    );
  }
}
