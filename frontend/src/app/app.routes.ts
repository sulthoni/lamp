import { Routes } from '@angular/router';

import { HomeComponent } from './components/home/home.component';
import { NotFoundComponent } from './components/not-found/not-found.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },

  {
    path: 'db-config',
    loadComponent: () =>
      import('./components/dbconfig/dbconfig.component').then(
        (mod) => mod.DbconfigComponent
      ),
  },
  {
    path: 'build-local-ontology',
    loadComponent: () =>
      import(
        './components/build-local-ontology/build-local-ontology.component'
      ).then((mod) => mod.BuildLocalOntologyComponent),
  },
  {
    path: 'publish',
    loadComponent: () =>
      import('./components/publish/publish.component').then(
        (mod) => mod.PublishComponent
      ),
  },
  {
    path: 'query',
    loadComponent: () =>
      import('./components/query/query.component').then(
        (mod) => mod.QueryComponent
      ),
  },
  {
    path: 'turtle-viewer',
    loadComponent: () =>
      import('./components/turtle-viewer/turtle-viewer.component').then(
        (mod) => mod.TurtleViewerComponent
      ),
  },
  {
    path: 'turtle-browser',
    loadComponent: () =>
      import('./components/turtle-browser/turtle-browser.component').then(
        (mod) => mod.TurtleBrowserComponent
      ),
  },
  {
    path: 'table-structure',
    loadComponent: () =>
      import('./components/table-structure/table-structure.component').then(
        (mod) => mod.TableStructureComponent
      ),
  },
  {
    path: 'mapping',
    loadComponent: () =>
      import('./components/mapping/mapping.component').then(
        (mod) => mod.MappingComponent
      ),
  },
  {
    path: 'mapping-table-to-ontology',
    loadComponent: () =>
      import(
        './components/mapping-table-to-ontology/mapping-table-to-ontology.component'
      ).then((mod) => mod.MappingTableToOntologyComponent),
  },
  {
    path: 'auto-mapping',
    loadComponent: () =>
      import('./components/auto-mapping/auto-mapping.component').then(
        (mod) => mod.AutoMappingComponent
      ),
  },
  {
    path: 'ontology-class-parser',
    loadComponent: () =>
      import(
        './components/ontology-class-parser/ontology-class-parser.component'
      ).then((mod) => mod.OntologyClassParserComponent),
  },

  { path: '**', component: NotFoundComponent },
];
