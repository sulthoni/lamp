import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataFactory, Parser, Store } from 'n3';

const { namedNode } = DataFactory;

interface ClassInfo {
  uri: string;
  label: string;
  comment: string;
  isDefinedBy: string;
  dataProperties: PropertyInfo[];
  objectProperties: PropertyInfo[];
  subClasses: ClassInfo[];
  depth: number;
}

interface PropertyInfo {
  uri: string;
  label: string;
  comment: string;
}

@Component({
  selector: 'app-ontology-class-parser',
  imports: [CommonModule, FormsModule],
  templateUrl: './ontology-class-parser.component.html',
  styleUrl: './ontology-class-parser.component.css',
})
export class OntologyClassParserComponent implements OnInit {
  rootClasses: ClassInfo[] = [];
  loading = false;
  error = '';
  showDetails = false;
  expandedClasses = new Set<string>();
  selectedTTLFileName: string | null = null;

  private store!: Store;
  private ttlContent = ''; // Replace with actual content

  ngOnInit() {
    // Automatically load on init if needed
  }

  /**
   * Preprocesses TTL content to handle complex patterns that n3 parser may struggle with
   */
  private preprocessTTL(content: string): string {
    // Remove or simplify problematic xsd:pattern restrictions
    // This regex finds owl:withRestrictions blocks with xsd:pattern and removes them
    let processed = content.replace(
      /owl:withRestrictions\s*\(\s*\[\s*xsd:pattern\s+"[^"]*"\s*\]\s*\)/g,
      'owl:withRestrictions ( )'
    );

    // Alternative: Replace entire rdfs:range block that contains patterns
    // This is more aggressive but safer for complex cases
    processed = processed.replace(
      /rdfs:range\s+\[\s*a\s+rdfs:Datatype\s*;[^;]*owl:withRestrictions[^;]*xsd:pattern[^\]]*\]\s*;/g,
      'rdfs:range xsd:string ;'
    );

    return processed;
  }

  async loadOntology() {
    this.loading = true;
    this.error = '';
    this.rootClasses = [];

    try {
      // Preprocess the TTL content to handle problematic patterns
      const processedContent = this.preprocessTTL(this.ttlContent);

      // Parse the TTL file with error handling
      const parser = new Parser({
        format: 'text/turtle',
        blankNodePrefix: '_:b',
      });

      this.store = new Store();

      const quads = parser.parse(processedContent);

      quads.forEach((quad) => {
        this.store.addQuad(quad);
      });

      this.buildClassHierarchy();
      this.loading = false;
    } catch (err: any) {
      console.error('Parse error:', err);
      this.error = `Error parsing ontology: ${err.message}\n\nThis may be due to complex OWL patterns in the file. Try simplifying the ontology or check the console for details.`;
      this.loading = false;
    }
  }

  private buildClassHierarchy() {
    const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
    const RDFS_SUBCLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
    const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
    const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';
    const RDFS_IS_DEFINED_BY =
      'http://www.w3.org/2000/01/rdf-schema#isDefinedBy';
    const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
    const OWL_DATATYPE_PROPERTY =
      'http://www.w3.org/2002/07/owl#DatatypeProperty';
    const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty';
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

    // Get all classes
    const classQuads = this.store.getQuads(
      null,
      namedNode(RDF_TYPE),
      namedNode(OWL_CLASS),
      null
    );
    const allClasses = new Map<string, ClassInfo>();

    // Initialize all classes
    classQuads.forEach((quad) => {
      const classUri = quad.subject.value;

      // Skip blank nodes
      if (quad.subject.termType === 'BlankNode') {
        return;
      }

      const labels = this.getAllLiterals(classUri, RDFS_LABEL);
      const comments = this.getAllLiterals(classUri, RDFS_COMMENT);
      const isDefinedBy = this.getObject(classUri, RDFS_IS_DEFINED_BY);

      allClasses.set(classUri, {
        uri: classUri,
        label: labels[0] || '',
        comment: comments[0] || '',
        isDefinedBy,
        dataProperties: this.getPropertiesForClass(
          classUri,
          OWL_DATATYPE_PROPERTY,
          RDFS_DOMAIN
        ),
        objectProperties: this.getPropertiesForClass(
          classUri,
          OWL_OBJECT_PROPERTY,
          RDFS_DOMAIN
        ),
        subClasses: [],
        depth: 0,
      });
    });

    // Build hierarchy
    const childToParent = new Map<string, string>();

    allClasses.forEach((classInfo, classUri) => {
      const subClassQuads = this.store.getQuads(
        namedNode(classUri),
        namedNode(RDFS_SUBCLASS_OF),
        null,
        null
      );

      subClassQuads.forEach((quad) => {
        if (quad.object.termType === 'NamedNode') {
          const parentUri = quad.object.value;
          if (allClasses.has(parentUri)) {
            childToParent.set(classUri, parentUri);
          }
        }
      });
    });

    // Organize into hierarchy
    const roots: ClassInfo[] = [];

    allClasses.forEach((classInfo, classUri) => {
      if (!childToParent.has(classUri)) {
        roots.push(classInfo);
      }
    });

    // Add children to parents
    childToParent.forEach((parentUri, childUri) => {
      const parent = allClasses.get(parentUri);
      const child = allClasses.get(childUri);
      if (parent && child) {
        child.depth = parent.depth + 1;
        parent.subClasses.push(child);
      }
    });

    // Sort alphabetically
    const sortClasses = (classes: ClassInfo[]) => {
      classes.sort((a, b) =>
        this.getShortName(a.uri).localeCompare(this.getShortName(b.uri))
      );
      classes.forEach((c) => sortClasses(c.subClasses));
    };

    sortClasses(roots);
    this.rootClasses = roots;
  }

  private getPropertiesForClass(
    classUri: string,
    propertyType: string,
    domainPredicate: string
  ): PropertyInfo[] {
    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
    const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';

    const properties: PropertyInfo[] = [];
    const propertyQuads = this.store.getQuads(
      null,
      namedNode(RDF_TYPE),
      namedNode(propertyType),
      null
    );

    propertyQuads.forEach((quad) => {
      if (quad.subject.termType === 'BlankNode') {
        return;
      }

      const propUri = quad.subject.value;
      const domainQuads = this.store.getQuads(
        namedNode(propUri),
        namedNode(domainPredicate),
        null,
        null
      );

      domainQuads.forEach((domainQuad) => {
        if (
          domainQuad.object.value === classUri ||
          this.isDomainMatch(domainQuad.object, classUri)
        ) {
          const labels = this.getAllLiterals(propUri, RDFS_LABEL);
          const comments = this.getAllLiterals(propUri, RDFS_COMMENT);

          properties.push({
            uri: propUri,
            label: labels[0] || '',
            comment: comments[0] || '',
          });
        }
      });
    });

    return properties;
  }

  private isDomainMatch(domainNode: any, classUri: string): boolean {
    // Handle union domains
    if (domainNode.termType === 'BlankNode') {
      const OWL_UNION_OF = 'http://www.w3.org/2002/07/owl#unionOf';
      const unionQuads = this.store.getQuads(
        domainNode,
        namedNode(OWL_UNION_OF),
        null,
        null
      );

      // Check if classUri is in the union
      for (const unionQuad of unionQuads) {
        if (unionQuad.object.termType === 'BlankNode') {
          // Follow the list structure
          const members = this.getListMembers(unionQuad.object);
          if (members.includes(classUri)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private getListMembers(listNode: any): string[] {
    const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
    const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
    const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';

    const members: string[] = [];
    let currentNode = listNode;

    while (currentNode && currentNode.value !== RDF_NIL) {
      const firstQuads = this.store.getQuads(
        currentNode,
        namedNode(RDF_FIRST),
        null,
        null
      );
      if (firstQuads.length > 0) {
        members.push(firstQuads[0].object.value);
      }

      const restQuads = this.store.getQuads(
        currentNode,
        namedNode(RDF_REST),
        null,
        null
      );
      if (restQuads.length > 0) {
        currentNode = restQuads[0].object;
      } else {
        break;
      }
    }

    return members;
  }

  private getLiteral(subject: string, predicate: string): string {
    const quads = this.store.getQuads(
      namedNode(subject),
      namedNode(predicate),
      null,
      null
    );
    if (quads.length > 0 && quads[0].object.termType === 'Literal') {
      return quads[0].object.value;
    }
    return '';
  }

  private getAllLiterals(subject: string, predicate: string): string[] {
    const quads = this.store.getQuads(
      namedNode(subject),
      namedNode(predicate),
      null,
      null
    );
    return quads
      .filter((q) => q.object.termType === 'Literal')
      .map((q) => q.object.value);
  }

  private getObject(subject: string, predicate: string): string {
    const quads = this.store.getQuads(
      namedNode(subject),
      namedNode(predicate),
      null,
      null
    );
    if (quads.length > 0) {
      return quads[0].object.value;
    }
    return '';
  }

  getShortName(uri: string): string {
    if (uri.includes('#')) {
      return uri.split('#').pop() || uri;
    }
    if (uri.includes('/')) {
      const parts = uri.split('/');
      return parts[parts.length - 1] || uri;
    }
    return uri;
  }

  toggleClass(classInfo: ClassInfo) {
    if (this.expandedClasses.has(classInfo.uri)) {
      this.expandedClasses.delete(classInfo.uri);
    } else {
      this.expandedClasses.add(classInfo.uri);
    }
  }

  onTTLFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.selectedTTLFileName = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.ttlContent = e.target?.result as string;
      };
      reader.readAsText(file);
    }
  }
}
