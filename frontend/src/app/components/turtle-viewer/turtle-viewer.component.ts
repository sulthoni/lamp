import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { NgxJsonViewerModule } from 'ngx-json-viewer';
import { MappingService } from '../../services/mapping.service';
import { OntologyNode, Property } from './../../models/mapping';

@Component({
  selector: 'app-turtle-viewer',
  imports: [CommonModule, NgxJsonViewerModule],
  templateUrl: './turtle-viewer.component.html',
  styleUrl: './turtle-viewer.component.css',
})
export class TurtleViewerComponent implements OnInit {
  ontologyTree: OntologyNode[] = [];
  selectedNode: OntologyNode | null = null;
  ancestorsSelectedNode: OntologyNode[] = [];

  classSearch = '';
  propertySearch = '';
  filteredOntologyTree: OntologyNode[] = [];
  globalOntology = '';
  exportedSchemaJson: string | null = null;
  exportedSchemaData: any = null;
  flatExportedSchemaJson: string | null = null;
  flatExportedSchemaData: any[] = [];
  activeTab: 'browse' | 'code' = 'browse';
  selectedTurtleFileName: string | null = null;
  loadingButtonSelectFile: boolean = false;

  constructor(
    private http: HttpClient,
    private mappingService: MappingService
  ) {}

  ngOnInit() {
    // Subscribe to service observables
    this.mappingService.ontologyTree$.subscribe((tree) => {
      this.ontologyTree = tree;
      this.filteredOntologyTree = tree;
    });

    this.mappingService.exportedSchemaData$.subscribe((data) => {
      this.exportedSchemaData = data;
    });

    this.mappingService.exportedSchemaJson$.subscribe((json) => {
      this.exportedSchemaJson = json;
    });

    this.mappingService.flatExportedSchemaData$.subscribe((data) => {
      this.flatExportedSchemaData = data;
    });

    this.mappingService.flatExportedSchemaJson$.subscribe((json) => {
      this.flatExportedSchemaJson = json;
    });
  }

  async onFileSelected(event: any) {
    this.loadingButtonSelectFile = true;
    const file = event.target.files[0];
    this.selectedTurtleFileName = file ? file.name : null;

    if (file) {
      try {
        const text = await this.readFile(file);
        console.log('File content preview:', text.substring(0, 500));

        await this.mappingService.parseTurtleContent(text);

        // Debug parsed content
        this.mappingService.debugParsedContent();

        await this.exportTurtleSchema();

        console.log(
          'Turtle file parsed and schema exported.',
          this.exportedSchemaData
        );
        console.log('Flat exported schema:', this.flatExportedSchemaData);

        this.loadingButtonSelectFile = false;
      } catch (error) {
        console.error('Parsing error:', error);
        this.loadingButtonSelectFile = false;
      }
    }
  }

  exportTurtleSchema() {
    try {
      this.mappingService.exportTurtleSchema();
    } catch (error) {
      console.error('Failed to export turtle schema:', error);
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

  toggleNode(node: OntologyNode) {
    node.expanded = !node.expanded;
  }

  selectNode(node: OntologyNode) {
    this.selectedNode = node;
    this.ancestorsSelectedNode = this.mappingService.findAllAncestorClassNodes(
      node.id
    );
  }

  // Now using service methods instead of local ones
  getDataProperties(): Property[] {
    if (!this.selectedNode) return [];
    return this.mappingService.getDataProperties(this.selectedNode.id);
  }

  getObjectProperties(): Property[] {
    if (!this.selectedNode) return [];
    return this.mappingService.getObjectProperties(this.selectedNode.id);
  }

  getPropertyRelationships(prop: Property): string {
    if (!this.selectedNode) return '';
    return this.mappingService.getPropertyRelationships(
      prop,
      this.selectedNode.id
    );
  }

  hasCardinality(prop: Property): boolean {
    return this.mappingService.hasCardinality(prop);
  }

  getAncestorLabels(): string {
    if (!this.selectedNode) return '—';
    return this.mappingService.getAncestorLabels(this.selectedNode.id);
  }

  // Convenience methods that delegate to service
  hasParentClass(classId: string): boolean {
    return this.mappingService.hasParentClass(classId);
  }

  findParentClassNode(classId: string): OntologyNode | null {
    return this.mappingService.findParentClassNode(classId);
  }

  findAllAncestorClassNodes(classId: string): OntologyNode[] {
    return this.mappingService.findAllAncestorClassNodes(classId);
  }

  getSelectedNodeParentInfo() {
    if (!this.selectedNode) {
      return { hasParent: false, parentNode: null, ancestors: [] };
    }
    return this.mappingService.getSelectedNodeParentInfo(this.selectedNode.id);
  }

  logParentHierarchy(classId: string): void {
    this.mappingService.logParentHierarchy(classId);
  }

  filterClasses() {
    if (!this.classSearch) {
      this.filteredOntologyTree = this.ontologyTree;
      return;
    }

    const searchTerm = this.classSearch.toLowerCase();
    this.filteredOntologyTree = this.filterNodes(this.ontologyTree, searchTerm);
  }

  private filterNodes(
    nodes: OntologyNode[],
    searchTerm: string
  ): OntologyNode[] {
    return nodes
      .filter((node) => {
        const matches = node.label.toLowerCase().includes(searchTerm);
        const filteredChildren = this.filterNodes(node.children, searchTerm);

        if (filteredChildren.length > 0) {
          return true;
        }

        return matches;
      })
      .map((node) => ({
        ...node,
        children: this.filterNodes(node.children, searchTerm),
      }));
  }

  saveExportedSchema() {
    if (!this.exportedSchemaJson) return;
    const blob = new Blob([this.exportedSchemaJson], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'turtle-schema.json';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  saveFlatExportedSchema() {
    if (!this.flatExportedSchemaJson) return;
    const blob = new Blob([this.flatExportedSchemaJson], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'turtle-schema.json';
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
