import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { ConnectionService } from '../../services/connection.service';
import { DatabaseConnection } from '../../models/connections';

@Component({
  selector: 'app-dbconfig',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dbconfig.component.html',
  styleUrl: './dbconfig.component.css',
})
export class DbconfigComponent {
  connectionForm: FormGroup;
  connections: DatabaseConnection[] = [];
  isEditing = false;
  currentConnectionId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private connectionService: ConnectionService
  ) {
    this.connectionForm = this.fb.group({
      name: ['', Validators.required],
      type: ['mysql', Validators.required],
      host: ['', Validators.required],
      port: ['', Validators.required],
      database: ['', Validators.required],
      username: ['', Validators.required],
      password: ['', Validators.required],
    });
  }

  ngOnInit() {
    this.loadConnections();
  }

  loadConnections() {
    this.connectionService
      .getConnections()
      .subscribe((connections) => (this.connections = connections));
  }

  onSubmit() {
    if (this.connectionForm.valid) {
      const connection = this.connectionForm.value;
      if (this.isEditing && this.currentConnectionId) {
        connection.id = this.currentConnectionId;
        this.connectionService.updateConnection(connection).subscribe(() => {
          this.loadConnections();
          this.resetForm();
        });
      } else {
        this.connectionService.saveConnection(connection).subscribe(() => {
          this.loadConnections();
          this.resetForm();
        });
      }
    }
  }

  testConnection() {
    if (this.connectionForm.valid) {
      this.connectionService
        .testConnection(this.connectionForm.value)
        .subscribe(
          (response) => alert('Connection successful!'),
          (error) => alert('Connection failed: ' + error.message)
        );
    }
  }

  editConnection(connection: DatabaseConnection | null) {
    if (!connection) {
      return;
    }
    this.isEditing = true;
    this.currentConnectionId = connection.id ?? null;
    this.connectionForm.patchValue(connection);
  }

  resetForm() {
    this.isEditing = false;
    this.currentConnectionId = null;
    this.connectionForm.reset({
      type: 'mysql',
    });
  }
}
