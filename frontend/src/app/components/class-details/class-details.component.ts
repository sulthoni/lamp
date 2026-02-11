import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OntologyService } from '../../services/ontology.service';
import { Subscription } from 'rxjs';
interface Class {
  uri: string;
  label: string;
  subClasses: string[];
  properties: { data: any[]; object: any[] };
}

@Component({
  selector: 'app-class-details',
  imports: [CommonModule],
  templateUrl: './class-details.component.html',
  styleUrl: './class-details.component.css',
})
export class ClassDetailsComponent implements OnInit, OnDestroy {
  selectedClass: Class | null = null;
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
}
