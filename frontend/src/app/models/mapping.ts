export interface OntologyNode {
  id: string;
  label: string;
  description?: string; // Add this
  definition?: string; // Add this
  children: OntologyNode[];
  expanded: boolean;
  level: number;
}

export interface Property {
  id: string;
  label: string;
  type: 'data' | 'object';
  domains: string[];
  ranges: string[];
  functional: boolean;
  // Remove these expansion-related fields:
  // expandedFrom?: string;
  // expandedForClass?: string;
  // expandedRelationship?: 'domain' | 'range';

  // Keep these for other features:
  minCardinality?: number;
  maxCardinality?: number;
  exactCardinality?: number;
}
