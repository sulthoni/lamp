import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OntologyService } from '../../services/ontology.service';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
interface Class {
  uri: string;
  label: string;
  subClasses: string[];
  properties: { data: any[]; object: any[] };
}
interface Property {
  uri: string;
  label: string;
  domain: string[];
  range: string[];
  cardinality: string | undefined;
}
@Component({
  selector: 'app-property-panel',
  imports: [CommonModule, FormsModule],
  templateUrl: './property-panel.component.html',
  styleUrl: './property-panel.component.css',
})
export class PropertyPanelComponent implements OnInit, OnDestroy {
  selectedClass: Class | null = null;
  propertyFilter: string = '';
  private selectedClassSubscription: Subscription | undefined;
  constructor(private ontologyService: OntologyService) {}

  ngOnInit(): void {
    this.selectedClassSubscription =
      this.ontologyService.selectedClass$.subscribe((clazz) => {
        this.selectedClass = clazz;
      });
  }

  ngOnDestroy(): void {
    this.selectedClassSubscription?.unsubscribe();
  }

  filterProperties(properties: Property[]): Property[] {
    if (!this.propertyFilter) {
      return properties;
    }
    const filter = this.propertyFilter.toLocaleLowerCase();
    return properties.filter((prop) =>
      prop.label.toLocaleLowerCase().includes(filter)
    );
  }
}
