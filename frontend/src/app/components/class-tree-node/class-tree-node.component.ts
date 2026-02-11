import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OntologyService } from '../../services/ontology.service';

interface Class {
  uri: string;
  label: string;
  subClasses: string[];
  properties: { data: any[]; object: any[] };
}

@Component({
  selector: 'app-class-tree-node',
  imports: [CommonModule],
  templateUrl: './class-tree-node.component.html',
  styleUrl: './class-tree-node.component.css',
})
export class ClassTreeNodeComponent implements OnInit {
  @Input() classUri: string = '';
  classes: Map<string, Class> = new Map();
  constructor(private ontologyService: OntologyService) {}

  ngOnInit(): void {
    this.classes = this.ontologyService.getClasses();
  }
  hasSubclasses(classUri: string): boolean {
    const clazz = this.classes.get(classUri);
    return !!clazz && clazz.subClasses.length > 0;
  }

  selectClass(classUri: string) {
    this.ontologyService.setSelectedClass(this.classes.get(classUri) || null);
  }
}
