import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  DatabaseConnection,
  ForeignKeyInfo,
  TableStructures,
} from '../models/connections';

@Injectable({
  providedIn: 'root',
})
export class ConnectionService {
  constructor(private http: HttpClient) {}

  getConnections(): Observable<DatabaseConnection[]> {
    return this.http.get<DatabaseConnection[]>(
      `${environment.application.backendAdminUrl}/connections`
    );
  }

  testConnection(connection: DatabaseConnection): Observable<any> {
    console.log(connection);
    return this.http.post(
      `${environment.application.backendAdminUrl}/test-connection`,
      connection
    );
  }

  saveConnection(
    connection: DatabaseConnection
  ): Observable<DatabaseConnection> {
    return this.http.post<DatabaseConnection>(
      `${environment.application.backendAdminUrl}/connections`,
      connection
    );
  }

  updateConnection(
    connection: DatabaseConnection
  ): Observable<DatabaseConnection> {
    return this.http.put<DatabaseConnection>(
      `${environment.application.backendAdminUrl}/connections/${connection.id}`,
      connection
    );
  }

  getTableStructure(connectionId: String): Observable<any> {
    return this.http.get(
      `${environment.application.backendAdminUrl}/table-structures/${connectionId}`
    );
  }

  saveTableStructure(
    tableStructures: TableStructures,
    options?: any
  ): Observable<any> {
    // If options is provided, pass it to http.post (for responseType: 'blob')
    return this.http.post(
      `${environment.application.backendAdminUrl}/table-structures`,
      tableStructures,
      options || {}
    );
  }

  loadTableStructure(): Observable<TableStructures> {
    return this.http.get<TableStructures>(
      `${environment.application.backendAdminUrl}/load-table-structures`
    );
  }

  getSampleData(
    connectionId: String,
    tableName: string,
    limit: number
  ): Observable<any[]> {
    return this.http.get<any[]>(
      `${environment.application.backendAdminUrl}/connections/${connectionId}/tables/${tableName}/sample?limit=${limit}`
    );
  }

  getForeignKeys(
    connectionId: String,
    tableName: string
  ): Observable<ForeignKeyInfo[]> {
    return this.http.get<ForeignKeyInfo[]>(
      `${environment.application.backendAdminUrl}/connections/${connectionId}/tables/${tableName}/foreign-keys`
    );
  }
}
