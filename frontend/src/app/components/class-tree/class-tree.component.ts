import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OntologyService } from '../../services/ontology.service';
import { Subscription } from 'rxjs';
import { ClassTreeNodeComponent } from '../class-tree-node/class-tree-node.component';
interface Class {
  uri: string;
  label: string;
  subClasses: string[];
  properties: { data: any[]; object: any[] };
}

@Component({
  selector: 'app-class-tree',
  imports: [CommonModule, ClassTreeNodeComponent],
  templateUrl: './class-tree.component.html',
  styleUrl: './class-tree.component.css',
})
export class ClassTreeComponent implements OnInit, OnDestroy {
  classHierarchy: string[] = [];
  classes: Map<string, Class> = new Map();
  loading: boolean = false;
  private loadingSubscription: Subscription | undefined;
  private classesSubscription: Subscription | undefined;

  constructor(private ontologyService: OntologyService) {}

  ngOnInit(): void {
    this.loadingSubscription = this.ontologyService.loading$.subscribe(
      (loading) => {
        console.log('loading class-tree', loading);
        this.loading = loading;
      }
    );

    this.classesSubscription = this.ontologyService.classes$.subscribe(
      (classes) => {
        console.log('classes class-tree', classes);
        this.classes = this.ontologyService.getClasses();
      }
    );

    // this.classes = this.ontologyService.getClasses();
    console.log(this.classes);
    this.classHierarchy = this.ontologyService.getClassHierarchy();
  }
  ngOnDestroy(): void {
    this.loadingSubscription?.unsubscribe();
  }

  isClassExpanded(classUri: string): boolean {
    return false;
  }

  toggleExpansion(classUri: string): void {}

  selectClass(classUri: string) {
    this.ontologyService.setSelectedClass(this.classes.get(classUri) || null);
  }

  hasSubclasses(classUri: string): boolean {
    const clazz = this.classes.get(classUri);
    return !!clazz && clazz.subClasses.length > 0;
  }
}
