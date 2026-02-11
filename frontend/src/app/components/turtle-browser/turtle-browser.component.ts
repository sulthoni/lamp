import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileBrowserComponent } from '../file-browser/file-browser.component';
import { ClassTreeComponent } from '../class-tree/class-tree.component';
import { ClassDetailsComponent } from '../class-details/class-details.component';
import { PropertyPanelComponent } from '../property-panel/property-panel.component';

@Component({
  selector: 'app-turtle-browser',
  imports: [
    CommonModule,
    FileBrowserComponent,
    ClassTreeComponent,
    ClassDetailsComponent,
    PropertyPanelComponent,
  ],
  templateUrl: './turtle-browser.component.html',
  styleUrl: './turtle-browser.component.css',
})
export class TurtleBrowserComponent {}
