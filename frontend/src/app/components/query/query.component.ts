import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import {
  faDatabase,
  faPlay,
  faSync,
  faExclamationTriangle,
  faTable,
} from '@fortawesome/free-solid-svg-icons';

interface SparqlResult {
  head: {
    vars: string[];
  };
  results: {
    bindings: any[];
  };
}

@Component({
  selector: 'app-query',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './query.component.html',
  styleUrl: './query.component.css',
})
export class QueryComponent implements OnInit {
  queryForm: FormGroup;
  results: SparqlResult | null = null;
  error: string | null = null;
  isLoading = false;

  // Font Awesome icons
  faDatabase = faDatabase;
  faPlay = faPlay;
  faSync = faSync;
  faExclamationTriangle = faExclamationTriangle;
  faTable = faTable;

  constructor(private fb: FormBuilder, private http: HttpClient) {
    this.queryForm = this.fb.group({
      repositoryId: ['', Validators.required],
      query: ['', Validators.required],
    });
  }

  ngOnInit(): void {}

  executeQuery(): void {
    if (this.queryForm.valid) {
      this.isLoading = true;
      this.error = null;
      this.results = null;

      const repositoryId = this.queryForm.get('repositoryId')?.value;
      const query = this.queryForm.get('query')?.value;

      // GraphDB endpoint URL - update with your GraphDB server URL
      const endpoint = `http://127.0.0.1:7200/repositories/${repositoryId}`;

      const headers = new HttpHeaders()
        .set('Accept', 'application/sparql-results+json')
        .set('Access-Control-Allow-Origin', '*')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      const params = new URLSearchParams();
      params.set('query', query);

      this.http
        .post<SparqlResult>(endpoint, params.toString(), { headers })
        .pipe(
          catchError((error) => {
            let errorMessage = 'An error occurred while executing the query';
            if (error.error?.message) {
              errorMessage = error.error.message;
            }
            return throwError(() => errorMessage);
          })
        )
        .subscribe({
          next: (response) => {
            this.results = response;
            this.isLoading = false;
          },
          error: (error) => {
            this.error = error;
            this.isLoading = false;
          },
        });
    }
  }
}
