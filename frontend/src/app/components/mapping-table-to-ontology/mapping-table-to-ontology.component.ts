import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';

interface Item {
  id: number;
  name: string;
}

interface Item {
  id: number;
  name: string;
}

@Component({
  selector: 'app-mapping-table-to-ontology',
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './mapping-table-to-ontology.component.html',
  styleUrl: './mapping-table-to-ontology.component.css',
})
export class MappingTableToOntologyComponent {
  availableItems: Item[] = [
    { id: 1, name: 'Item A' },
    { id: 2, name: 'Item B' },
    { id: 3, name: 'Item C' },
    { id: 4, name: 'Item D' },
  ];

  connectedItems: Item[] = [];
  lines: any[] = [];

  private LeaderLine: any;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Dynamically import leader-line-new only in browser
      import('leader-line-new').then((module) => {
        this.LeaderLine = module.default;
      });
    }
  }

  drop(event: CdkDragDrop<Item[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      // Ensure we're in a browser environment and LeaderLine is loaded
      if (isPlatformBrowser(this.platformId) && this.LeaderLine) {
        // Safe element selection
        const startContainer = event.previousContainer.element.nativeElement;
        const endContainer = event.container.element.nativeElement;

        const startElement = startContainer.querySelector(
          `#${startContainer.id.split('-')[0]}-${event.item.data.id}`
        );
        const endElement = endContainer.querySelector(
          `#${endContainer.id.split('-')[0]}-${event.item.data.id}`
        );

        // Null check before creating leader line
        if (startElement && endElement) {
          this.createLeaderLine(
            startElement as HTMLElement,
            endElement as HTMLElement
          );
        }
      }
    }
  }

  createLeaderLine(start: HTMLElement, end: HTMLElement) {
    if (this.LeaderLine) {
      const line = new this.LeaderLine(start, end, {
        color: 'blue',
        size: 3,
        path: 'grid',
      });
      this.lines.push(line);
    }
  }

  removeConnection(index: number) {
    // Remove the corresponding leader line
    if (this.lines[index]) {
      this.lines[index].remove();
      this.lines.splice(index, 1);
    }

    // Move the item back to available items
    const removedItem = this.connectedItems.splice(index, 1)[0];
    this.availableItems.push(removedItem);
  }
}
