import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { NamedNode } from '@rdfjs/types';
import * as N3 from 'n3';
import { Prefixes } from 'n3';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OntologyNode, Property } from '../models/mapping';

@Injectable({
  providedIn: 'root',
})
export class MappingService {
  // Shared state for parsed ontology data
  private ontologyTreeSubject = new BehaviorSubject<OntologyNode[]>([]);
  private propertiesSubject = new BehaviorSubject<Map<string, Property>>(
    new Map()
  );
  private exportedSchemaDataSubject = new BehaviorSubject<any>(null);
  private exportedSchemaJsonSubject = new BehaviorSubject<string | null>(null);
  private flatExportedSchemaDataSubject = new BehaviorSubject<any[]>([]);
  private flatExportedSchemaJsonSubject = new BehaviorSubject<string | null>(
    null
  );

  // Public observables
  public ontologyTree$ = this.ontologyTreeSubject.asObservable();
  public properties$ = this.propertiesSubject.asObservable();
  public exportedSchemaData$ = this.exportedSchemaDataSubject.asObservable();
  public exportedSchemaJson$ = this.exportedSchemaJsonSubject.asObservable();
  public flatExportedSchemaData$ =
    this.flatExportedSchemaDataSubject.asObservable();
  public flatExportedSchemaJson$ =
    this.flatExportedSchemaJsonSubject.asObservable();

  // Private parsing variables
  private parser = new N3.Parser();
  public classMap = new Map<string, Set<string>>();
  public properties = new Map<string, Property>();
  private classLabels = new Map<string, string>();
  private classComments = new Map<string, string>();
  private classDefinitions = new Map<string, string>();

  // Add this property to track named individuals
  private namedIndividuals = new Set<string>();

  // Add these properties to track language information
  private classLabelLanguages = new Map<string, string | null>();
  private classCommentLanguages = new Map<string, string | null>();

  // Add these properties to track prefixes
  private prefixes = new Map<string, string>(); // Maps namespace URI to prefix
  private reversePrefixes = new Map<string, string>(); // Maps prefix to namespace URI

  // Add these properties after the existing ones
  private complexClassExpressions = new Map<
    string,
    {
      type: 'intersection' | 'union';
      classes: string[];
      restrictions?: any[];
    }
  >();
  private blankNodes = new Map<string, any>(); // Track blank nodes
  private rdfLists = new Map<string, string[]>(); // Track parsed RDF lists

  constructor(private http: HttpClient) {}

  getGlobalOntology(): Observable<any> {
    return this.http.get(
      `${environment.application.backendAdminUrl}/global-ontology`,
      { responseType: 'text' }
    );
  }

  /**
   * Parse turtle content and build ontology tree
   */
  parseTurtleContent(turtleContent: string): Promise<OntologyNode[]> {
    return new Promise((resolve, reject) => {
      console.log('Starting to parse turtle content...');

      // Clear previous data
      this.classMap.clear();
      this.properties.clear();
      this.classLabels.clear();
      this.classComments.clear();
      this.classDefinitions.clear();
      this.namedIndividuals.clear();
      this.classLabelLanguages.clear();
      this.classCommentLanguages.clear();
      this.prefixes.clear(); // Add this line
      this.reversePrefixes.clear(); // Add this line

      // Create new parser instance
      const parser = new N3.Parser();

      parser.parse(turtleContent, (error, quad, prefixes) => {
        if (error) {
          console.error('Error parsing turtle file:', error);
          reject(error);
          return;
        }

        if (quad) {
          console.log('Processing quad:', {
            subject: quad.subject.value,
            predicate: quad.predicate.value,
            object: quad.object.value,
            objectLanguage: this.getLanguageTag(quad.object),
          });
          this.processQuad(quad);
        } else {
          // Parsing complete - prefixes are available here
          if (prefixes) {
            this.storePrefixes(prefixes);
            console.log('Captured prefixes:', this.prefixes);
            console.log('Reverse prefixes:', this.reversePrefixes);
          }

          console.log('Parsing complete!');
          console.log('Class map:', this.classMap);
          console.log('Properties:', this.properties);
          console.log('Named individuals (excluded):', this.namedIndividuals);
          console.log('Class labels:', this.classLabels);
          console.log('Label languages:', this.classLabelLanguages);
          console.log('Comment languages:', this.classCommentLanguages);

          const ontologyTree = this.buildOntologyTree();
          console.log('Built ontology tree:', ontologyTree);

          if (ontologyTree.length === 0) {
            console.warn(
              'No classes found in ontology tree. This might indicate parsing issues.'
            );
          }

          // Update subjects
          this.ontologyTreeSubject.next(ontologyTree);
          this.propertiesSubject.next(new Map(this.properties));

          resolve(ontologyTree);
        }
      });
    });
  }

  /**
   * Process individual quad from turtle content
   */
  private processQuad(quad: N3.Quad) {
    const subject = quad.subject.value;
    const predicate = quad.predicate.value;
    const object = quad.object.value;

    switch (predicate) {
      case 'http://www.w3.org/2000/01/rdf-schema#subClassOf':
        this.processSubClassRelation(quad);
        break;
      case 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type':
        if (object === 'http://www.w3.org/2002/07/owl#Class') {
          // Explicitly declared class - add to our tracking
          this.ensureClassExists(subject);
        } else if (object === 'http://www.w3.org/2002/07/owl#NamedIndividual') {
          // Track named individuals (instances) to exclude them
          this.namedIndividuals.add(subject);
        } else if (
          object === 'http://www.w3.org/2002/07/owl#DatatypeProperty' ||
          object === 'http://www.w3.org/2002/07/owl#ObjectProperty'
        ) {
          this.addProperty(subject, object);
        }
        break;
      case 'http://www.w3.org/2000/01/rdf-schema#domain':
        this.processDomainRelation(subject, object);
        break;
      case 'http://www.w3.org/2000/01/rdf-schema#range':
        this.processRangeRelation(subject, object);
        break;
      // Add handlers for complex class expressions
      case 'http://www.w3.org/2002/07/owl#intersectionOf':
        this.processIntersectionOf(subject, quad.object);
        break;
      case 'http://www.w3.org/2002/07/owl#unionOf':
        this.processUnionOf(subject, quad.object);
        break;
      case 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first':
        this.processListFirst(subject, object);
        break;
      case 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest':
        this.processListRest(subject, object);
        break;
      case 'http://www.w3.org/2000/01/rdf-schema#label':
        // Handle multilanguage labels with English priority
        this.processLabel(subject, quad.object);
        // Only add to classes if it's not a property, not a named individual, and passes class check
        // if (
        //   this.isOntologyClass(subject) &&
        //   !this.isProperty(subject) &&
        //   !this.isNamedIndividual(subject)
        // ) {
        //   this.ensureClassExists(subject);
        // }
        break;
      case 'http://www.w3.org/2000/01/rdf-schema#comment':
        // Handle multilanguage comments with English priority
        this.processComment(subject, quad.object);
        // Only add to classes if it's not a property, not a named individual, and passes class check
        // if (
        //   this.isOntologyClass(subject) &&
        //   !this.isProperty(subject) &&
        //   !this.isNamedIndividual(subject)
        // ) {
        //   this.ensureClassExists(subject);
        // }
        break;
      case 'http://www.w3.org/2000/01/rdf-schema#isDefinedBy':
        this.classDefinitions.set(subject, quad.object.value);
        break;
    }
  }

  /**
   * Ensure a class exists in our class map (even if it has no children)
   * Only add if it's definitely a class, not a property or named individual
   */
  private ensureClassExists(classId: string) {
    if (
      !this.classMap.has(classId) &&
      this.isOntologyClass(classId) &&
      !this.isProperty(classId) &&
      !this.isNamedIndividual(classId)
    ) {
      this.classMap.set(classId, new Set());
    }
  }

  /**
   * Check if a URI represents a named individual (instance)
   */
  private isNamedIndividual(uri: string): boolean {
    return this.namedIndividuals.has(uri);
  }

  private addProperty(propertyId: string, type: string) {
    if (!this.properties.has(propertyId)) {
      this.properties.set(propertyId, {
        id: propertyId,
        label: this.getBestPropertyLabel(propertyId), // Use getBestPropertyLabel
        type: type.includes('DatatypeProperty') ? 'data' : 'object',
        domains: [],
        ranges: [],
        functional: false,
      });
    }
  }

  /**
   * Get the best available label for a property
   */
  private getBestPropertyLabel(propertyId: string): string {
    // Check if we have an explicit label for this property
    const explicitLabel = this.classLabels.get(propertyId);
    if (explicitLabel) {
      return explicitLabel;
    }

    // Generate prefixed label if no explicit label
    return this.generatePrefixedLabel(propertyId);
  }

  private processSubClassRelation(quad: N3.Quad) {
    const child = quad.subject.value;
    const parent = quad.object.value;

    // Ignore relationships where parent is a blank node (complex expression)
    if (this.isBlankNode(parent)) {
      console.log(
        `Ignoring subclass relation: ${child} -> ${parent} (parent is a complex expression/blank node)`
      );
      return;
    }

    // Also ignore if parent is not a valid ontology class
    if (!this.isOntologyClass(parent)) {
      console.log(
        `Ignoring subclass relation: ${child} -> ${parent} (parent is not a valid class)`
      );
      return;
    }

    if (!this.classMap.has(parent)) {
      this.classMap.set(parent, new Set());
    }
    this.classMap.get(parent)!.add(child);

    console.log(`Added subclass relation: ${child} -> ${parent}`);
  }

  /**
   * Enhanced domain relation processing to handle complex class expressions
   */
  private processDomainRelation(propertyId: string, domain: string) {
    const property = this.properties.get(propertyId);
    if (property) {
      // Check if domain is a complex class expression
      const complexExpression = this.complexClassExpressions.get(domain);
      if (complexExpression) {
        // For both unionOf and intersectionOf, add all classes to domains
        complexExpression.classes.forEach((cls) => {
          if (!property.domains.includes(cls)) {
            property.domains.push(cls);
          }
        });

        console.log(
          `Expanded ${
            complexExpression.type
          } domain for ${propertyId}: [${complexExpression.classes.join(', ')}]`
        );
      } else {
        // Simple domain
        if (!property.domains.includes(domain)) {
          property.domains.push(domain);
        }
      }
    }
  }

  /**
   * Enhanced range relation processing to handle complex class expressions
   */
  private processRangeRelation(propertyId: string, range: string) {
    const property = this.properties.get(propertyId);
    if (property) {
      // Check if range is a complex class expression
      const complexExpression = this.complexClassExpressions.get(range);
      if (complexExpression) {
        // For both unionOf and intersectionOf, add all classes to ranges
        complexExpression.classes.forEach((cls) => {
          if (!property.ranges.includes(cls)) {
            property.ranges.push(cls);
          }
        });

        console.log(
          `Expanded ${
            complexExpression.type
          } range for ${propertyId}: [${complexExpression.classes.join(', ')}]`
        );
      } else {
        // Simple range
        if (!property.ranges.includes(range)) {
          property.ranges.push(range);
        }
      }
    }
  }

  private buildOntologyTree(): OntologyNode[] {
    const rootNodes = new Set<string>();
    const childNodes = new Set<string>();
    const allClasses = new Set<string>();

    // Collect all classes from subclass relationships (excluding named individuals and blank nodes)
    this.classMap.forEach((children, parent) => {
      if (!this.isNamedIndividual(parent) && !this.isBlankNode(parent)) {
        rootNodes.add(parent);
        allClasses.add(parent);
      }
      children.forEach((child) => {
        if (!this.isNamedIndividual(child) && !this.isBlankNode(child)) {
          childNodes.add(child);
          allClasses.add(child);
        }
      });
    });

    // Add classes that have labels or comments (but filter out properties, named individuals, and blank nodes)
    this.classLabels.forEach((label, classId) => {
      if (
        this.isOntologyClass(classId) &&
        !this.isProperty(classId) &&
        !this.isNamedIndividual(classId) &&
        !this.isBlankNode(classId) // Add this check
      ) {
        allClasses.add(classId);
      }
    });

    this.classComments.forEach((comment, classId) => {
      if (
        this.isOntologyClass(classId) &&
        !this.isProperty(classId) &&
        !this.isNamedIndividual(classId) &&
        !this.isBlankNode(classId) // Add this check
      ) {
        allClasses.add(classId);
      }
    });

    // Log collected classes for debugging
    Array.from(rootNodes).forEach((node) => {
      console.log(`Root node: ${node}`);
      console.log(`Not child nodes: ${!childNodes.has(node)}`);
      console.log(`Not isNamedIndividual: ${!this.isNamedIndividual(node)}`);
      console.log(`Not isBlankNode: ${!this.isBlankNode(node)}`);
      console.log('---');
    });

    // Find real root nodes (classes that have children but are not children themselves)
    const realRootNodes = Array.from(rootNodes)
      .filter(
        (node) =>
          !childNodes.has(node) &&
          !this.isNamedIndividual(node) &&
          !this.isBlankNode(node) // Add this check
      )
      .sort((a, b) => {
        const prefixedA = this.generatePrefixedLabel(a).toLowerCase();
        const prefixedB = this.generatePrefixedLabel(b).toLowerCase();
        return prefixedA.localeCompare(prefixedB);
      });

    // If we have hierarchical relationships, use them
    if (realRootNodes.length > 0) {
      return realRootNodes.map((node) => this.buildNode(node, 0));
    }

    // If no hierarchical relationships exist, create flat structure for all classes
    const standaloneClasses = Array.from(allClasses).filter(
      (classId) =>
        this.isOntologyClass(classId) &&
        !this.isProperty(classId) &&
        !this.isNamedIndividual(classId) &&
        !this.isBlankNode(classId) // Add this check
    );

    return standaloneClasses.map((classId) => this.buildFlatNode(classId, 0));
  }

  /**
   * Check if a URI represents an ontology class (not an XSD datatype, property, or named individual)
   */
  private isOntologyClass(uri: string): boolean {
    // First check if it's a named individual - if so, it's not a class
    if (this.isNamedIndividual(uri)) {
      return false;
    }

    // First check if it's a property - if so, it's not a class
    if (this.isProperty(uri)) {
      return false;
    }

    // Exclude XSD datatypes and other common non-class URIs
    const nonClassPrefixes = [
      'http://www.w3.org/2001/XMLSchema#',
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property',
      'http://www.w3.org/2000/01/rdf-schema#Property',
      'http://www.w3.org/2002/07/owl#DatatypeProperty',
      'http://www.w3.org/2002/07/owl#ObjectProperty',
      'http://www.w3.org/2002/07/owl#FunctionalProperty',
      'http://www.w3.org/2002/07/owl#TransitiveProperty',
      'http://www.w3.org/2002/07/owl#SymmetricProperty',
      'http://www.w3.org/2002/07/owl#InverseFunctionalProperty',
      'http://www.w3.org/2002/07/owl#NamedIndividual', // Add this for extra safety
    ];

    // Exclude exact matches for OWL/RDF schema URIs that are not classes
    const nonClassExactMatches = [
      'http://www.w3.org/2002/07/owl#Class',
      'http://www.w3.org/2000/01/rdf-schema#Class',
      'http://www.w3.org/2002/07/owl#NamedIndividual', // Add this for extra safety
    ];

    if (nonClassExactMatches.includes(uri)) {
      return false;
    }

    return !nonClassPrefixes.some((prefix) => uri.startsWith(prefix));
  }

  /**
   * Check if a URI represents a property (not a class)
   */
  private isProperty(uri: string): boolean {
    // Check if it's in our properties map
    if (this.properties.has(uri)) {
      return true;
    }

    // Check common property type URIs
    const propertyTypes = [
      'http://www.w3.org/2002/07/owl#DatatypeProperty',
      'http://www.w3.org/2002/07/owl#ObjectProperty',
      'http://www.w3.org/2002/07/owl#FunctionalProperty',
      'http://www.w3.org/2002/07/owl#InverseFunctionalProperty',
      'http://www.w3.org/2002/07/owl#TransitiveProperty',
      'http://www.w3.org/2002/07/owl#SymmetricProperty',
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property',
    ];

    return propertyTypes.some((type) => uri.includes(type));
  }

  private buildNode(id: string, level: number): OntologyNode {
    const children = Array.from(this.classMap.get(id) || []).map((childId) =>
      this.buildNode(childId, level + 1)
    );

    return {
      id,
      label: this.getBestLabel(id), // Use getBestLabel instead of direct lookup
      description: this.classComments.get(id) || '',
      definition: this.classDefinitions.get(id) || '',
      children,
      expanded: false,
      level,
    };
  }

  /**
   * Build a flat node (no children from hierarchy)
   */
  private buildFlatNode(id: string, level: number): OntologyNode {
    return {
      id,
      label: this.getBestLabel(id), // Use getBestLabel instead of direct lookup
      description: this.classComments.get(id) || '',
      definition: this.classDefinitions.get(id) || '',
      children: [], // No hierarchical children
      expanded: false,
      level,
    };
  }

  private getLocalName(uri: string): string {
    const parts = uri.split(/[\/#]/);
    return parts[parts.length - 1];
  }

  // ==============================================
  // MOVED FUNCTIONS - Now reusable across components
  // ==============================================

  /**
   * Checks if a child class is a subclass of any of the given parent classes
   * @param childId - The ID of the child class to check
   * @param parentIds - Array of potential parent class IDs
   * @returns true if childId is a subclass of any parentId, false otherwise
   */
  isParentClass(childId: string, parentIds: string[]): boolean {
    if (!parentIds?.length) return false;

    let current = childId;
    const visited = new Set<string>();

    while (current) {
      if (parentIds.includes(current)) return true;
      if (visited.has(current)) break;

      visited.add(current);

      let foundParent = false;
      this.classMap.forEach((children, parent) => {
        if (children.has(current)) {
          current = parent;
          foundParent = true;
        }
      });

      if (!foundParent) break;
    }

    return false;
  }

  /**
   * Checks if a class has a parent class
   * @param classId - The ID of the class to check
   * @returns true if the class has a parent, false otherwise
   */
  hasParentClass(classId: string): boolean {
    if (!classId) return false;

    // Check if this class appears as a child in any parent-child relationship
    for (const [parent, children] of this.classMap.entries()) {
      if (children.has(classId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Finds the direct parent class ID of a given class
   * @param classId - The ID of the class to find parent for
   * @returns The parent class ID if found, null otherwise
   */
  findParentClassId(classId: string): string | null {
    if (!classId || !this.hasParentClass(classId)) {
      return null;
    }

    // Find the direct parent by checking which parent has this class as a child
    for (const [parent, children] of this.classMap.entries()) {
      if (children.has(classId)) {
        return parent;
      }
    }
    return null;
  }

  /**
   * Finds the parent class node (OntologyNode) of a given class
   * @param classId - The ID of the class to find parent node for
   * @returns The parent OntologyNode if found, null otherwise
   */
  findParentClassNode(classId: string): OntologyNode | null {
    if (!classId || !this.hasParentClass(classId)) {
      return null;
    }

    const parentId = this.findParentClassId(classId);
    if (!parentId) {
      return null;
    }

    // Search for the parent node in the current ontology tree
    return this.findNodeInTree(parentId, this.ontologyTreeSubject.value);
  }

  /**
   * Recursively searches for a node with the given ID in the tree
   * @param nodeId - The ID of the node to find
   * @param nodes - The array of nodes to search in (optional, defaults to current ontology tree)
   * @returns The OntologyNode if found, null otherwise
   */
  findNodeInTree(nodeId: string, nodes?: OntologyNode[]): OntologyNode | null {
    const searchNodes = nodes || this.ontologyTreeSubject.value;

    for (const node of searchNodes) {
      if (node.id === nodeId) {
        return node;
      }

      // Recursively search in children
      const foundInChildren = this.findNodeInTree(nodeId, node.children);
      if (foundInChildren) {
        return foundInChildren;
      }
    }
    return null;
  }

  /**
   * Gets all ancestor class IDs of a given class (all parents up the hierarchy)
   * @param classId - The ID of the class to find ancestors for
   * @returns Array of ancestor class IDs, ordered from direct parent to root
   */
  findAllAncestorClassIds(classId: string): string[] {
    if (!classId || !this.hasParentClass(classId)) {
      return [];
    }

    const ancestors: string[] = [];
    let current = classId;
    const visited = new Set<string>();

    while (current && !visited.has(current)) {
      visited.add(current);
      const parentId = this.findParentClassId(current);

      if (parentId) {
        ancestors.push(parentId);
        current = parentId;
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Gets all ancestor class nodes of a given class
   * @param classId - The ID of the class to find ancestor nodes for
   * @returns Array of ancestor OntologyNodes, ordered from direct parent to root
   */
  findAllAncestorClassNodes(classId: string): OntologyNode[] {
    const ancestorIds = this.findAllAncestorClassIds(classId);
    const ancestorNodes: OntologyNode[] = [];

    for (const ancestorId of ancestorIds) {
      const node = this.findNodeInTree(ancestorId);
      if (node) {
        ancestorNodes.push(node);
      }
    }

    return ancestorNodes;
  }

  /**
   * Get property relationships for a given node and property
   * @param prop - The property to check relationships for
   * @param nodeId - The ID of the node to check relationships against
   * @returns String describing the relationships (e.g., "Domain", "Range", "Domain, Range")
   */
  getPropertyRelationships(prop: Property, nodeId: string): string {
    const relationships = [];

    if (prop.domains.includes(nodeId)) {
      relationships.push('Domain');
    }

    if (prop.type === 'object' && prop.ranges.includes(nodeId)) {
      relationships.push('Range');
    }

    return relationships.join(', ');
  }

  /**
   * Get parent information for a given node
   * @param nodeId - The ID of the node to get parent info for
   * @returns Object containing hasParent flag, parentNode, and ancestors
   */
  getSelectedNodeParentInfo(nodeId: string): {
    hasParent: boolean;
    parentNode: OntologyNode | null;
    ancestors: OntologyNode[];
  } {
    if (!nodeId) {
      return { hasParent: false, parentNode: null, ancestors: [] };
    }

    const hasParent = this.hasParentClass(nodeId);
    const parentNode = hasParent ? this.findParentClassNode(nodeId) : null;
    const ancestors = hasParent ? this.findAllAncestorClassNodes(nodeId) : [];

    return { hasParent, parentNode, ancestors };
  }

  /**
   * Log parent hierarchy for a given class (useful for debugging)
   * @param classId - The ID of the class to log hierarchy for
   */
  logParentHierarchy(classId: string): void {
    console.log(`=== Parent Hierarchy for Class: ${classId} ===`);

    if (!this.hasParentClass(classId)) {
      console.log('This class has no parent (it is a root class)');
      return;
    }

    const directParent = this.findParentClassId(classId);
    console.log(`Direct Parent ID: ${directParent}`);

    const parentNode = this.findParentClassNode(classId);
    if (parentNode) {
      console.log(`Direct Parent Node:`, {
        id: parentNode.id,
        label: parentNode.label,
        description: parentNode.description,
      });
    }

    const allAncestors = this.findAllAncestorClassIds(classId);
    console.log(`All Ancestor IDs: [${allAncestors.join(' -> ')}]`);

    const ancestorNodes = this.findAllAncestorClassNodes(classId);
    console.log(
      'All Ancestor Nodes:',
      ancestorNodes.map((node) => ({
        id: node.id,
        label: node.label,
        description: node.description,
      }))
    );
  }

  /**
   * Get ancestor labels as comma-separated string
   * @param nodeId - The ID of the node to get ancestor labels for
   * @returns Comma-separated string of ancestor labels, or "—" if no ancestors
   */
  getAncestorLabels(nodeId: string): string {
    const ancestors = this.findAllAncestorClassNodes(nodeId);
    return ancestors && ancestors.length > 0
      ? ancestors.map((node) => node.label).join(', ')
      : '—';
  }

  /**
   * Get data properties for a given node
   * @param nodeId - The ID of the node to get data properties for
   * @returns Array of data properties
   */
  getDataProperties(nodeId: string): Property[] {
    if (!nodeId) return [];

    return Array.from(this.properties.values()).filter(
      (prop) =>
        prop.type === 'data' &&
        (prop.domains.includes(nodeId) ||
          this.isParentClass(nodeId, prop.domains))
    );
  }

  /**
   * Get object properties for a given node
   * @param nodeId - The ID of the node to get object properties for
   * @returns Array of object properties
   */
  getObjectProperties(nodeId: string): Property[] {
    if (!nodeId) return [];

    return Array.from(this.properties.values()).filter((prop) => {
      if (prop.type !== 'object') return false;

      // Check if the node is a domain or range of the property
      const isDomain = prop.domains.some(
        (domain) => domain === nodeId || this.isParentClass(nodeId, [domain])
      );

      const isRange = prop.ranges.some(
        (range) => range === nodeId || this.isParentClass(nodeId, [range])
      );

      return isDomain || isRange;
    });
  }

  /**
   * Check if property has cardinality constraints
   * @param prop - The property to check
   * @returns true if property has cardinality constraints, false otherwise
   */
  hasCardinality(prop: Property): boolean {
    return (
      prop.minCardinality !== undefined ||
      prop.maxCardinality !== undefined ||
      prop.exactCardinality !== undefined
    );
  }

  // ==============================================
  // EXISTING FUNCTIONS (unchanged)
  // ==============================================

  /**
   * Export turtle schema to JSON format
   */
  exportTurtleSchema(): {
    hierarchical: any[];
    flat: any[];
    hierarchicalJson: string;
    flatJson: string;
  } {
    const ontologyTree = this.ontologyTreeSubject.value;

    if (!ontologyTree.length) {
      throw new Error('No ontology loaded.');
    }

    const buildExportTree = (node: OntologyNode): any => {
      const dataProps = this.getDataProperties(node.id).map((prop) => ({
        name: this.getBestPropertyLabel(prop.id), // Use getBestPropertyLabel
        dataType: prop.ranges
          .map((r) => this.generatePrefixedLabel(r))
          .join(', '), // Use prefixed labels
        uriDataType: prop.ranges.join(', '),
      }));

      const objectProps = this.getObjectProperties(node.id).map((prop) => ({
        name: this.getBestPropertyLabel(prop.id), // Use getBestPropertyLabel
        domain: prop.domains
          .map((d) => this.generatePrefixedLabel(d))
          .join(', '), // Use prefixed labels
        uriDomain: prop.domains.join(', '),
        range: prop.ranges.map((r) => this.generatePrefixedLabel(r)).join(', '), // Use prefixed labels
        uriRange: prop.ranges.join(', '),
      }));

      // find similar classes by label name in the parent-child relationship
      const similarClasses: string[] = this.findAllAncestorClassNodes(node.id)
        .filter((ancestor) => ancestor.label === node.label)
        .map((ancestor) => ancestor.id);

      return {
        label: node.label, // This already uses getBestLabel from buildNode
        description: node.description || '',
        definition: node.definition || '',
        URI: node.id,
        prefixedURI: this.generatePrefixedLabel(node.id), // Add prefixed URI
        similarClasses: similarClasses || [],
        dataProperties: dataProps,
        objectProperties: objectProps,
        children: node.children.map(buildExportTree),
      };
    };

    const hierarchical = ontologyTree.map(buildExportTree);
    const flat = this.flattenExportedSchemaData(hierarchical);
    const hierarchicalJson = JSON.stringify(hierarchical, null, 2);
    const flatJson = JSON.stringify(flat, null, 2);

    // Update subjects
    this.exportedSchemaDataSubject.next(hierarchical);
    this.exportedSchemaJsonSubject.next(hierarchicalJson);
    this.flatExportedSchemaDataSubject.next(flat);
    this.flatExportedSchemaJsonSubject.next(flatJson);

    return { hierarchical, flat, hierarchicalJson, flatJson };
  }

  /**
   * Flatten hierarchical data and remove duplicates based on URI
   * @param data - The hierarchical data to flatten
   * @returns Flattened array without duplicates
   */
  private flattenExportedSchemaData(data: any[]): any[] {
    // First, flatten the data
    const flattened = data.flatMap((item) => {
      const { children, ...rest } = item;
      return [rest, ...this.flattenExportedSchemaData(children)];
    });

    // Remove duplicates based on URI
    return this.removeDuplicatesByMultipleFields(flattened);
  }

  /**
   * Remove duplicate items based on URI field
   * @param data - Array of items that may contain duplicates
   * @returns Array with duplicates removed
   */
  private removeDuplicatesByURI(data: any[]): any[] {
    const seen = new Map<string, any>();

    for (const item of data) {
      const uri = item.URI;
      if (uri && !seen.has(uri)) {
        seen.set(uri, item);
      } else if (!uri) {
        // Handle items without URI by creating a unique key based on label
        const uniqueKey = `no-uri-${item.label || 'unknown'}-${Math.random()}`;
        if (!seen.has(uniqueKey)) {
          seen.set(uniqueKey, item);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Alternative method: Remove duplicates based on multiple fields
   * @param data - Array of items that may contain duplicates
   * @returns Array with duplicates removed
   */
  private removeDuplicatesByMultipleFields(data: any[]): any[] {
    const seen = new Set<string>();
    const result: any[] = [];

    for (const item of data) {
      // Create a unique key based on URI, label, and description
      const uniqueKey = `${item.URI || 'no-uri'}-${item.label || 'no-label'}-${
        item.description || 'no-desc'
      }`;

      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Enhanced method: Remove duplicates with merge option for properties
   * @param data - Array of items that may contain duplicates
   * @param mergeProperties - Whether to merge properties from duplicate items
   * @returns Array with duplicates removed
   */
  private removeDuplicatesAdvanced(
    data: any[],
    mergeProperties: boolean = true
  ): any[] {
    const uriMap = new Map<string, any>();

    for (const item of data) {
      const uri = item.URI;

      if (!uri) {
        // Handle items without URI separately
        continue;
      }

      if (uriMap.has(uri)) {
        if (mergeProperties) {
          // Merge properties from duplicate items
          const existing = uriMap.get(uri);

          // Merge data properties
          if (item.dataProperties && existing.dataProperties) {
            const mergedDataProps = this.mergeUniqueProperties(
              existing.dataProperties,
              item.dataProperties
            );
            existing.dataProperties = mergedDataProps;
          }

          // Merge object properties
          if (item.objectProperties && existing.objectProperties) {
            const mergedObjectProps = this.mergeUniqueProperties(
              existing.objectProperties,
              item.objectProperties
            );
            existing.objectProperties = mergedObjectProps;
          }

          // Use the first item's basic info but merge descriptions if needed
          if (!existing.description && item.description) {
            existing.description = item.description;
          }

          if (!existing.definition && item.definition) {
            existing.definition = item.definition;
          }
        }
      } else {
        uriMap.set(uri, { ...item });
      }
    }

    return Array.from(uriMap.values());
  }

  /**
   * Merge unique properties from two arrays
   * @param existing - Existing properties array
   * @param newProps - New properties to merge
   * @returns Merged array with unique properties
   */
  private mergeUniqueProperties(existing: any[], newProps: any[]): any[] {
    const propertyMap = new Map<string, any>();

    // Add existing properties
    existing.forEach((prop) => {
      propertyMap.set(prop.name, prop);
    });

    // Add new properties (will overwrite if same name)
    newProps.forEach((prop) => {
      propertyMap.set(prop.name, prop);
    });

    return Array.from(propertyMap.values());
  }

  /**
   * Get current exported schema data
   */
  getCurrentExportedData() {
    return {
      hierarchical: this.exportedSchemaDataSubject.value,
      flat: this.flatExportedSchemaDataSubject.value,
      hierarchicalJson: this.exportedSchemaJsonSubject.value,
      flatJson: this.flatExportedSchemaJsonSubject.value,
    };
  }

  /**
   * Clear all parsed data including complex expressions
   */
  clearParsedData() {
    this.classMap.clear();
    this.properties.clear();
    this.classLabels.clear();
    this.classComments.clear();
    this.classDefinitions.clear();
    this.namedIndividuals.clear();
    this.classLabelLanguages.clear();
    this.classCommentLanguages.clear();
    this.prefixes.clear();
    this.reversePrefixes.clear();
    this.complexClassExpressions.clear(); // Add this line
    this.blankNodes.clear(); // Add this line
    this.rdfLists.clear(); // Add this line

    this.ontologyTreeSubject.next([]);
    this.propertiesSubject.next(new Map());
    this.exportedSchemaDataSubject.next(null);
    this.exportedSchemaJsonSubject.next(null);
    this.flatExportedSchemaDataSubject.next([]);
    this.flatExportedSchemaJsonSubject.next(null);
  }

  /**
   * Get all classes discovered during parsing (for debugging)
   */
  getAllDiscoveredClasses(): string[] {
    const allClasses = new Set<string>();

    // Classes from hierarchy (excluding named individuals)
    this.classMap.forEach((children, parent) => {
      if (!this.isProperty(parent) && !this.isNamedIndividual(parent)) {
        allClasses.add(parent);
      }
      children.forEach((child) => {
        if (!this.isProperty(child) && !this.isNamedIndividual(child)) {
          allClasses.add(child);
        }
      });
    });

    // Classes with labels/comments (but exclude properties and named individuals)
    this.classLabels.forEach((label, classId) => {
      if (
        this.isOntologyClass(classId) &&
        !this.isProperty(classId) &&
        !this.isNamedIndividual(classId)
      ) {
        allClasses.add(classId);
      }
    });

    this.classComments.forEach((comment, classId) => {
      if (
        this.isOntologyClass(classId) &&
        !this.isProperty(classId) &&
        !this.isNamedIndividual(classId)
      ) {
        allClasses.add(classId);
      }
    });

    return Array.from(allClasses).sort();
  }

  /**
   * Enhanced debug method that includes complex expression information
   */
  debugParsedContent(): void {
    console.log('=== PARSING DEBUG INFO ===');
    console.log('Captured prefixes:', this.prefixes);
    console.log('All discovered classes:', this.getAllDiscoveredClasses());
    console.log(
      'All discovered properties:',
      Array.from(this.properties.keys()).sort()
    );
    console.log(
      'All named individuals (excluded):',
      Array.from(this.namedIndividuals).sort()
    );
    console.log('Complex class expressions:', this.complexClassExpressions);
    console.log('Blank nodes:', this.blankNodes);
    console.log('RDF lists:', this.rdfLists);
    console.log('Class hierarchy:', this.classMap);
    console.log('Properties details:', this.properties);

    // Show complex expression expansion results
    console.log('=== COMPLEX EXPRESSION EXPANSION RESULTS ===');
    this.properties.forEach((property, propertyId) => {
      if (property.domains.length > 0 || property.ranges.length > 0) {
        console.log(`\nProperty: ${this.generatePrefixedLabel(propertyId)}`);
        console.log(`  Label: ${property.label}`);
        console.log(`  Type: ${property.type}`);
        console.log(
          `  Domains: [${property.domains
            .map((d) => this.generatePrefixedLabel(d))
            .join(', ')}]`
        );
        console.log(
          `  Ranges: [${property.ranges
            .map((r) => this.generatePrefixedLabel(r))
            .join(', ')}]`
        );
      }
    });

    // Show complex class expressions found
    console.log('\n=== COMPLEX CLASS EXPRESSIONS FOUND ===');
    this.complexClassExpressions.forEach((expression, nodeId) => {
      console.log(
        `${nodeId}: ${expression.type} of [${expression.classes
          .map((cls) => this.generatePrefixedLabel(cls))
          .join(', ')}]`
      );
    });

    // Show label generation results
    console.log('=== LABEL GENERATION RESULTS ===');
    this.getAllDiscoveredClasses().forEach((classId) => {
      const explicitLabel = this.classLabels.get(classId);
      const prefixedLabel = this.generatePrefixedLabel(classId);
      const bestLabel = this.getBestLabel(classId);

      console.log(`Class ${classId}:`);
      console.log(`  Explicit label: ${explicitLabel || 'none'}`);
      console.log(`  Prefixed label: ${prefixedLabel}`);
      console.log(`  Best label: ${bestLabel}`);
    });

    // Show language preference results
    console.log('=== LANGUAGE PREFERENCE RESULTS ===');
    this.classLabels.forEach((label, classId) => {
      const language = this.classLabelLanguages.get(classId);
      console.log(
        `Class ${classId}: Label="${label}" (Language: ${language || 'none'})`
      );
    });

    // Verify no properties or named individuals in ontology tree
    const treeNodes = this.ontologyTreeSubject.value;
    const nodesWithProperties = treeNodes.filter((node) =>
      this.isProperty(node.id)
    );
    const nodesWithIndividuals = treeNodes.filter((node) =>
      this.isNamedIndividual(node.id)
    );

    if (nodesWithProperties.length === 0 && nodesWithIndividuals.length === 0) {
      console.log(
        '✅ Ontology tree contains only classes (no properties or named individuals)'
      );
      console.log('✅ English labels prioritized where available');
      console.log(
        '✅ Prefixed labels generated for classes without explicit labels'
      );
      console.log(
        '✅ Complex class expressions expanded into individual domains/ranges'
      );
    }
  }

  /**
   * Process label with language preference (English first) - Enhanced version
   */
  private processLabel(subject: string, objectTerm: N3.Term) {
    const value = objectTerm.value;
    const language = this.getLanguageTag(objectTerm);

    // Get current label and its language
    const currentLabel = this.classLabels.get(subject);
    const currentLanguage = this.classLabelLanguages.get(subject);

    // Priority order: English > no language tag > other languages
    if (this.isLanguagePreferred(language, currentLanguage!)) {
      this.classLabels.set(subject, value);
      this.classLabelLanguages.set(subject, language);
    }
  }

  /**
   * Process comment with language preference (English first) - Enhanced version
   */
  private processComment(subject: string, objectTerm: N3.Term) {
    const value = objectTerm.value;
    const language = this.getLanguageTag(objectTerm);

    // Get current comment and its language
    const currentComment = this.classComments.get(subject);
    const currentLanguage = this.classCommentLanguages.get(subject);

    // Priority order: English > no language tag > other languages
    if (this.isLanguagePreferred(language, currentLanguage!)) {
      this.classComments.set(subject, value);
      this.classCommentLanguages.set(subject, language);
    }
  }

  /**
   * Extract language tag from a term
   */
  private getLanguageTag(term: N3.Term): string | null {
    if (term.termType === 'Literal' && 'language' in term) {
      return (term as any).language || null;
    }
    return null;
  }

  /**
   * Determine if we should update the current label based on language priority
   */
  private shouldUpdateLabel(
    currentLabel: string | undefined,
    newValue: string,
    newLanguage: string | null
  ): boolean {
    // If no current label, accept the new one
    if (!currentLabel) {
      return true;
    }

    // Store language info for current label (we need to track this)
    const currentLanguage = this.getLabelLanguage(currentLabel);

    // Priority: English ('en') > no language > other languages
    return this.isLanguagePreferred(newLanguage, currentLanguage);
  }

  /**
   * Determine if we should update the current comment based on language priority
   */
  private shouldUpdateComment(
    currentComment: string | undefined,
    newValue: string,
    newLanguage: string | null
  ): boolean {
    // If no current comment, accept the new one
    if (!currentComment) {
      return true;
    }

    // Store language info for current comment
    const currentLanguage = this.getCommentLanguage(currentComment);

    // Priority: English ('en') > no language > other languages
    return this.isLanguagePreferred(newLanguage, currentLanguage);
  }

  /**
   * Check if new language is preferred over current language
   */
  private isLanguagePreferred(
    newLanguage: string | null,
    currentLanguage: string | null
  ): boolean {
    // If new language is English, always prefer it
    if (newLanguage === 'en') {
      return true;
    }

    // If current is English, don't replace it
    if (currentLanguage === 'en') {
      return false;
    }

    // If new has no language and current has a non-English language, prefer new
    if (!newLanguage && currentLanguage && currentLanguage !== 'en') {
      return true;
    }

    // If current has no language, don't replace it with another language
    if (!currentLanguage && newLanguage) {
      return false;
    }

    // Otherwise, keep the current one
    return false;
  }

  /**
   * Get the language of a stored label
   */
  private getLabelLanguage(label: string): string | null {
    // Find the entry with this label value
    for (const [classId, storedLabel] of this.classLabels.entries()) {
      if (storedLabel === label) {
        return this.classLabelLanguages.get(classId) || null;
      }
    }
    return null;
  }

  /**
   * Get the language of a stored comment
   */
  private getCommentLanguage(comment: string): string | null {
    // Find the entry with this comment value
    for (const [classId, storedComment] of this.classComments.entries()) {
      if (storedComment === comment) {
        return this.classCommentLanguages.get(classId) || null;
      }
    }
    return null;
  }

  /**
   * Store prefixes from the N3 parser
   */
  private storePrefixes(prefixes: Prefixes<NamedNode>): void {
    Object.entries(prefixes).forEach(([prefix, namedNode]) => {
      const namespaceUri = namedNode.value;
      this.prefixes.set(namespaceUri, prefix);
      this.reversePrefixes.set(prefix, namespaceUri);
    });
  }

  /**
   * Generate a prefixed label from a URI using available prefixes
   * @param uri - The full URI to convert
   * @returns Prefixed label (e.g., "skos:Concept") or local name if no prefix found
   */
  private generatePrefixedLabel(uri: string): string {
    // Try to find a matching prefix
    for (const [namespaceUri, prefix] of this.prefixes.entries()) {
      if (uri.startsWith(namespaceUri)) {
        const localName = uri.substring(namespaceUri.length);
        return `${prefix}:${localName}`;
      }
    }

    // Fallback to extracting local name if no prefix matches
    return this.getLocalName(uri);
  }

  /**
   * Get the best available label for a class
   * Priority: explicit label > prefixed label > local name
   */
  private getBestLabel(classId: string): string {
    // First check if we have an explicit label
    const explicitLabel = this.classLabels.get(classId);
    if (explicitLabel) {
      return explicitLabel;
    }

    // Generate prefixed label if no explicit label
    return this.generatePrefixedLabel(classId);
  }

  /**
   * Get prefix information for debugging or display
   */
  getPrefixInfo(): {
    prefixes: Map<string, string>;
    reversePrefixes: Map<string, string>;
  } {
    return {
      prefixes: new Map(this.prefixes),
      reversePrefixes: new Map(this.reversePrefixes),
    };
  }

  /**
   * Get all prefixed labels for classes (useful for display)
   */
  getAllPrefixedLabels(): Map<string, string> {
    const prefixedLabels = new Map<string, string>();

    this.getAllDiscoveredClasses().forEach((classId) => {
      prefixedLabels.set(classId, this.generatePrefixedLabel(classId));
    });

    return prefixedLabels;
  }

  /**
   * Process owl:intersectionOf expressions
   */
  private processIntersectionOf(subject: string, listNode: N3.Term): void {
    if (listNode.termType === 'BlankNode') {
      const classes = this.parseRdfList(listNode.value);
      this.complexClassExpressions.set(subject, {
        type: 'intersection',
        classes: classes,
      });
      console.log(
        `Found intersection class: ${subject} = intersection of [${classes.join(
          ', '
        )}]`
      );
    }
  }

  /**
   * Process owl:unionOf expressions
   */
  private processUnionOf(subject: string, listNode: N3.Term): void {
    if (listNode.termType === 'BlankNode') {
      const classes = this.parseRdfList(listNode.value);
      this.complexClassExpressions.set(subject, {
        type: 'union',
        classes: classes,
      });
      console.log(
        `Found union class: ${subject} = union of [${classes.join(', ')}]`
      );
    }
  }

  /**
   * Process rdf:first for RDF lists
   */
  private processListFirst(listNode: string, firstElement: string): void {
    if (!this.blankNodes.has(listNode)) {
      this.blankNodes.set(listNode, {});
    }
    this.blankNodes.get(listNode)!.first = firstElement;
  }

  /**
   * Process rdf:rest for RDF lists
   */
  private processListRest(listNode: string, restNode: string): void {
    if (!this.blankNodes.has(listNode)) {
      this.blankNodes.set(listNode, {});
    }
    this.blankNodes.get(listNode)!.rest = restNode;
  }

  /**
   * Parse an RDF list starting from a blank node
   */
  private parseRdfList(startNode: string): string[] {
    // Check if we already parsed this list
    if (this.rdfLists.has(startNode)) {
      return this.rdfLists.get(startNode)!;
    }

    const result: string[] = [];
    let currentNode = startNode;
    const visited = new Set<string>();

    while (
      currentNode &&
      currentNode !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil' &&
      !visited.has(currentNode)
    ) {
      visited.add(currentNode);

      const nodeData = this.blankNodes.get(currentNode);
      if (nodeData && nodeData.first) {
        result.push(nodeData.first);
        currentNode = nodeData.rest;
      } else {
        break;
      }
    }

    // Cache the result
    this.rdfLists.set(startNode, result);
    return result;
  }

  /**
   * Get formatted domain description
   */
  getFormattedDomains(property: Property): string {
    return property.domains
      .map((d) => this.generatePrefixedLabel(d))
      .join(', ');
  }

  /**
   * Get formatted range description
   */
  getFormattedRanges(property: Property): string {
    return property.ranges.map((r) => this.generatePrefixedLabel(r)).join(', ');
  }

  /**
   * Check if a URI represents a blank node
   * Blank nodes can be:
   * - n3-{number} format (N3.js default)
   * - _:{identifier} format (standard RDF)
   * - [a owl:Restriction ...] patterns (anonymous nodes)
   */
  private isBlankNode(uri: string): boolean {
    // Check for N3.js blank node format: starts with "n3-" followed by numbers
    if (/^n3-\d+$/.test(uri)) {
      return true;
    }

    // Check for standard RDF blank node format: starts with "_:"
    if (uri.startsWith('_:')) {
      return true;
    }

    // Check if it's in our tracked blank nodes (from complex expressions)
    if (this.blankNodes.has(uri)) {
      return true;
    }

    return false;
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
}
