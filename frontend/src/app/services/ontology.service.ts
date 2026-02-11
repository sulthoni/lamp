import { Injectable } from '@angular/core';
import { Parser, Quad } from 'n3';
import * as _ from 'lodash';
import { BehaviorSubject, Observable } from 'rxjs';

interface Class {
  uri: string;
  label: string;
  subClasses: string[];
  properties: { data: Property[]; object: Property[] };
}

interface Property {
  uri: string;
  label: string;
  domain: string[];
  range: string[];
  cardinality: string | undefined;
}

@Injectable({
  providedIn: 'root',
})
export class OntologyService {
  private parser = new Parser();
  private classes = new Map<string, Class>();
  private classHierarchy: string[] = [];
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public classesSubject = new BehaviorSubject<Map<string, Class>>(this.classes);
  private selectedClassSubject = new BehaviorSubject<Class | null>(null);

  public loading$ = this.loadingSubject.asObservable();
  public selectedClass$ = this.selectedClassSubject.asObservable();
  public classes$ = this.classesSubject.asObservable();

  constructor() {}

  setSelectedClass(clazz: Class | null) {
    this.selectedClassSubject.next(clazz);
  }
  parseTurtle(turtleContent: string): Promise<void> {
    console.log('Begin parsing turtle');
    return new Promise((resolve, reject) => {
      this.loadingSubject.next(true);
      this.classes.clear();
      this.classHierarchy = [];
      const quads: Quad[] = [];
      try {
        const triples = this.parser.parse(turtleContent);
        triples.forEach((quad) => quads.push(quad));
        console.log('success parsing turtle: ' + triples.toString());
      } catch (e) {
        this.loadingSubject.next(false);
        reject(e);
        console.log('failed parse turtle');
        return;
      }

      // Collect classes with labels and subclasses
      console.log('begin Collect classes with labels and subclasses');
      quads.forEach((quad) => {
        if (
          quad.predicate.value ===
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
          quad.object.value === 'http://www.w3.org/2000/01/rdf-schema#Class'
        ) {
          const classUri = quad.subject.value;
          this.classes.set(classUri, {
            uri: classUri,
            label: this.getLabel(quads, classUri),
            subClasses: [],
            properties: { data: [], object: [] },
          });
        }
      });

      quads.forEach((quad) => {
        if (
          quad.predicate.value ===
          'http://www.w3.org/2000/01/rdf-schema#subClassOf'
        ) {
          const subClassUri = quad.subject.value;
          const superClassUri = quad.object.value;
          const superClass = this.classes.get(superClassUri);
          if (superClass) {
            superClass.subClasses.push(subClassUri);
          }
        }
      });

      // Collect data properties
      console.log('begin Collect data properties');
      quads.forEach((quad) => {
        if (
          quad.predicate.value ===
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
          quad.object.value === 'http://www.w3.org/2002/07/owl#DatatypeProperty'
        ) {
          const propertyUri = quad.subject.value;
          const property = {
            uri: propertyUri,
            label: this.getLabel(quads, propertyUri),
            domain: this.getDomains(quads, propertyUri),
            range: this.getRanges(quads, propertyUri),
            cardinality: this.getCardinality(quads, propertyUri),
          };
          property.domain.forEach((domain) => {
            const clazz = this.classes.get(domain);
            if (clazz) {
              clazz.properties.data.push(property);
            }
          });
        }
      });

      // Collect object properties
      console.log('begin Collect object properties');
      quads.forEach((quad) => {
        if (
          quad.predicate.value ===
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
          quad.object.value === 'http://www.w3.org/2002/07/owl#ObjectProperty'
        ) {
          const propertyUri = quad.subject.value;
          const property = {
            uri: propertyUri,
            label: this.getLabel(quads, propertyUri),
            domain: this.getDomains(quads, propertyUri),
            range: this.getRanges(quads, propertyUri),
            cardinality: this.getCardinality(quads, propertyUri),
          };
          property.domain.forEach((domain) => {
            const clazz = this.classes.get(domain);
            if (clazz) {
              clazz.properties.object.push(property);
            }
          });
        }
      });
      this.createClassHierarchy();
      this.loadingSubject.next(false);
      console.log('Resolve');
      this.classesSubject.next(this.getClasses());
      resolve();
    });
  }

  private getLabel(quads: Quad[], subjectUri: string): string {
    const labelQuad = quads.find(
      (q) =>
        q.subject.value === subjectUri &&
        q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#label'
    );
    return labelQuad
      ? labelQuad.object.value
      : this.extractLocalName(subjectUri);
  }

  private getDomains(quads: Quad[], subjectUri: string): string[] {
    const domainQuads = quads.filter(
      (q) =>
        q.subject.value === subjectUri &&
        q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#domain'
    );
    return domainQuads.map((q) => q.object.value);
  }

  private getRanges(quads: Quad[], subjectUri: string): string[] {
    const rangeQuads = quads.filter(
      (q) =>
        q.subject.value === subjectUri &&
        q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#range'
    );
    return rangeQuads.map((q) => q.object.value);
  }
  private getCardinality(
    quads: Quad[],
    subjectUri: string
  ): string | undefined {
    const minCardinalityQuad = quads.find(
      (q) =>
        q.subject.value === subjectUri &&
        q.predicate.value === 'http://www.w3.org/2002/07/owl#minCardinality'
    );
    const maxCardinalityQuad = quads.find(
      (q) =>
        q.subject.value === subjectUri &&
        q.predicate.value === 'http://www.w3.org/2002/07/owl#maxCardinality'
    );
    if (
      minCardinalityQuad &&
      maxCardinalityQuad &&
      minCardinalityQuad.object.value === maxCardinalityQuad.object.value
    ) {
      return minCardinalityQuad.object.value;
    } else if (minCardinalityQuad) {
      return `min: ${minCardinalityQuad.object.value}`;
    } else if (maxCardinalityQuad) {
      return `max: ${maxCardinalityQuad.object.value}`;
    }

    return undefined;
  }

  private extractLocalName(uri: string): string {
    const lastSlashIndex = uri.lastIndexOf('/');
    if (lastSlashIndex !== -1 && lastSlashIndex < uri.length - 1) {
      return uri.substring(lastSlashIndex + 1);
    }
    return uri;
  }

  private createClassHierarchy(parentClassUri?: string): void {
    const parent = parentClassUri
      ? this.classes.get(parentClassUri)
      : undefined;
    if (parentClassUri) {
      this.classHierarchy.push(parentClassUri);
    } else {
      this.classHierarchy = [];
      this.classes.forEach((c) => {
        if (!this.isSubClass(c.uri)) {
          this.classHierarchy.push(c.uri);
        }
      });
      this.classHierarchy.sort((a, b) => {
        const classA = this.classes.get(a)!;
        const classB = this.classes.get(b)!;
        if (classA.subClasses.length > 0) {
          return -1;
        } else if (classB.subClasses.length > 0) {
          return 1;
        } else {
          return 0;
        }
      });
    }

    if (parent) {
      parent.subClasses.forEach((subClassUri) =>
        this.createClassHierarchy(subClassUri)
      );
    } else {
      this.classHierarchy.forEach((classUri) => {
        const clazz = this.classes.get(classUri);
        if (clazz) {
          clazz.subClasses.forEach((subClassUri) =>
            this.createClassHierarchy(subClassUri)
          );
        }
      });
    }
  }

  private isSubClass(classUri: string): boolean {
    return Array.from(this.classes.values()).some((c) =>
      c.subClasses.includes(classUri)
    );
  }

  getClasses(): Map<string, Class> {
    console.log('request getClass');
    return this.classes;
  }

  getClassHierarchy(): string[] {
    return this.classHierarchy;
  }

  getClass(classUri: string): Class | undefined {
    return this.classes.get(classUri);
  }
}
