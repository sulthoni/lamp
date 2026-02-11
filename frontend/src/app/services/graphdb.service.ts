import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class GraphdbService {
  private baseUrl = environment.application.backendGraphDBUrl; // GraphDB server URL
  private headers = new HttpHeaders({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  constructor(private http: HttpClient) {}

  getRepositories(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/rest/repositories`);
  }

  createRepository(config: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/rest/repositories`, config, {
      headers: this.headers,
    });
  }

  /**
   * Create config file for Ontop repository
   */
  createConfigFile(
    params: {
      hostName: string;
      port: number;
      databaseName: string;
      userName: string;
      password: string;
      driverClass: string;
      url: string;
      additionalProperties?: string;
    },
    driverType: string,
    fileLocation?: string | null
  ): Observable<{
    success: boolean;
    errorMessage: string;
    fileLocation: string;
  }> {
    // Encode the fileLocation parameter if provided
    const encodedFileLocation = fileLocation
      ? encodeURIComponent(fileLocation)
      : '';

    const url = `${this.baseUrl}/rest/repositories/ontop/jdbc-properties?driverType=${driverType}&fileLocation=${encodedFileLocation}&location=`;

    return this.http.post<{
      success: boolean;
      errorMessage: string;
      fileLocation: string;
    }>(url, params, {
      headers: this.headers,
    });
  }

  /**
   * Create Ontop repository with config
   */
  createOntopRepository(config: {
    id: string;
    params: {
      propertiesFile: { name: string; label: string; value: string };
      lensesFile: { name: string; label: string; value: string };
      isShacl: { name: string; label: string; value: string };
      owlFile: { name: string; label: string; value: string };
      constraintFile: { name: string; label: string; value: string };
      id: { name: string; label: string; value: string };
      title: { name: string; label: string; value: string };
      obdaFile: { name: string; label: string; value: string };
      dbMetadataFile: { name: string; label: string; value: string };
    };
    title: string;
    type: string;
    location: string;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/rest/repositories`, config, {
      headers: this.headers,
    });
  }

  /**
   * Updated testDatabaseConnection method
   */
  testDatabaseConnection(params: {
    hostName: string;
    port: number;
    databaseName: string;
    userName: string;
    password: string;
    driverClass: string;
    url: string;
    additionalProperties?: string;
    dbtype: string;
  }): Observable<{
    success: boolean;
    errorMessage: string;
    fileLocation: string;
  }> {
    const url = `${this.baseUrl}/rest/repositories/ontop/jdbc-properties?driverType=${params.dbtype}&fileLocation=&location=`;

    return this.http.post<{
      success: boolean;
      errorMessage: string;
      fileLocation: string;
    }>(url, params, {
      headers: this.headers,
    });
  }

  deleteRepository(repositoryId: string): Observable<any> {
    return this.http.delete(
      `${this.baseUrl}/rest/repositories/${repositoryId}`
    );
  }

  uploadTurtle(repositoryId: string, turtleData: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'text/turtle',
    });
    return this.http.post(
      `${this.baseUrl}/repositories/${repositoryId}/statements`,
      turtleData,
      { headers }
    );
  }

  uploadR2RML(repositoryId: string, r2rmlData: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'text/turtle',
    });
    return this.http.post(
      `${this.baseUrl}/repositories/${repositoryId}/r2rml`,
      r2rmlData,
      { headers }
    );
  }

  uploadFileToGraphDB(formData: FormData): Observable<{
    success: boolean;
    errorMessage: string;
    fileLocation: string;
  }> {
    return this.http.post<{
      success: boolean;
      errorMessage: string;
      fileLocation: string;
    }>(`${this.baseUrl}/rest/repositories/file/upload`, formData);
  }
}
