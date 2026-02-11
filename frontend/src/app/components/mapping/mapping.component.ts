import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { SVG } from '@svgdotjs/svg.js';

interface DraggedItem {
  index: number;
  type: 'left' | 'right';
  value: number | string;
}

@Component({
  selector: 'app-mapping',
  imports: [CommonModule],
  templateUrl: './mapping.component.html',
  styleUrl: './mapping.component.css',
})
export class MappingComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('connectionSvg', { static: true }) connectionSvg!: ElementRef;
  @ViewChild('leftPanel') leftPanel!: ElementRef;
  @ViewChild('rightPanel') rightPanel!: ElementRef;

  leftList: number[] = [1, 2, 3, 4, 5, 6];
  rightList: string[] = ['one', 'two', 'five', 'six', 'four', 'three'];
  connectedPairs: { left: number; right: string }[] = [];

  isDragging = false;
  currentDraggedItem: DraggedItem | null = null;

  private svgDrawing: any;
  private connectionLines: any[] = [];
  private isBrowser: boolean;
  private dragEndListener: any;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit() {
    if (this.isBrowser) {
      this.dragEndListener = this.onDragEnd.bind(this);
      document.addEventListener('dragend', this.dragEndListener);
    }
  }

  ngOnDestroy() {
    if (this.isBrowser && this.dragEndListener) {
      document.removeEventListener('dragend', this.dragEndListener);
    }
  }

  ngAfterViewInit() {
    if (this.isBrowser) {
      // Initialize SVG drawing using the nativeElement
      this.svgDrawing = SVG(this.connectionSvg.nativeElement);
    }
  }

  onDragEnd = () => {
    this.isDragging = false;
    this.currentDraggedItem = null;
  };

  drag(event: DragEvent, index: number, type: 'left' | 'right') {
    this.isDragging = true;
    const value =
      type === 'left' ? this.leftList[index] : this.rightList[index];
    this.currentDraggedItem = { index, type, value };
    event.dataTransfer?.setData('text/plain', value.toString());
  }

  allowDrop(event: DragEvent) {
    event.preventDefault();
  }

  drop(
    event: DragEvent,
    targetIndex: number,
    targetType: 'left' | 'right' = 'left'
  ) {
    event.preventDefault();

    if (!this.currentDraggedItem) return;

    // Prevent dropping on the same list
    if (this.currentDraggedItem.type === targetType) return;

    // Determine the connection based on drag and drop
    const connection =
      this.currentDraggedItem.type === 'left'
        ? {
            left: this.currentDraggedItem.value as number,
            right: this.rightList[targetIndex],
          }
        : {
            left: this.leftList[targetIndex],
            right: this.currentDraggedItem.value as string,
          };

    // Remove existing connection if the item is already connected
    this.removeExistingConnections(connection);

    // Add new connection
    this.connectedPairs.push(connection);

    // Draw connection line
    this.drawConnectionLine(connection);

    // Reset drag state
    this.isDragging = false;
    this.currentDraggedItem = null;
  }

  private removeExistingConnections(newConnection: {
    left: number;
    right: string;
  }) {
    // Remove existing connections for the same left or right items
    const existingConnectionIndex = this.connectedPairs.findIndex(
      (pair) =>
        pair.left === newConnection.left || pair.right === newConnection.right
    );

    if (existingConnectionIndex !== -1) {
      // Remove existing connection line
      if (this.connectionLines[existingConnectionIndex]) {
        this.connectionLines[existingConnectionIndex].remove();
        this.connectionLines.splice(existingConnectionIndex, 1);
      }

      // Remove from connected pairs
      this.connectedPairs.splice(existingConnectionIndex, 1);
    }
  }

  private drawConnectionLine(connection: { left: number; right: string }) {
    // Find the corresponding list items
    const leftItem = this.findListItem('left', connection.left);
    const rightItem = this.findListItem('right', connection.right);

    if (!leftItem || !rightItem) return;

    // Calculate positions
    const leftRect = leftItem.getBoundingClientRect();
    const rightRect = rightItem.getBoundingClientRect();
    const containerRect = this.leftPanel.nativeElement
      .closest('.container-fluid')
      .getBoundingClientRect();

    // Calculate start and end points (from right to left)
    const startX = rightRect.left - containerRect.left + window.scrollX;
    const startY =
      rightRect.top + rightRect.height / 2 - containerRect.top + window.scrollY;
    const endX = leftRect.right - containerRect.left + window.scrollX;
    const endY =
      leftRect.top + leftRect.height / 2 - containerRect.top + window.scrollY;

    // Create curved path
    const path = this.svgDrawing.path(`
      M ${startX} ${startY} 
      C ${(startX + endX) / 2} ${startY}, 
        ${(startX + endX) / 2} ${endY}, 
        ${endX} ${endY}
    `);

    // Style the path
    path
      .fill('none')
      .stroke({ color: '#007bff', width: 3, linecap: 'round' })
      .addClass('connection-line-path');

    // Create arrowhead (pointing towards left panel)
    const arrowSize = 8;
    const angle = Math.atan2(endY - startY, endX - startX);
    const arrowHead = this.svgDrawing.polygon([
      [endX, endY],
      [
        endX - arrowSize * Math.cos(angle - Math.PI / 6),
        endY - arrowSize * Math.sin(angle - Math.PI / 6),
      ],
      [
        endX - arrowSize * Math.cos(angle + Math.PI / 6),
        endY - arrowSize * Math.sin(angle + Math.PI / 6),
      ],
    ]);

    // Style arrowhead
    arrowHead.fill('#007bff').addClass('connection-line-path');

    // Combine path and arrowhead
    const group = this.svgDrawing.group();
    group.add(path);
    group.add(arrowHead);

    // Store the line for potential removal
    this.connectionLines.push(group);
  }

  private findListItem(
    side: 'left' | 'right',
    value: number | string
  ): HTMLElement | null {
    const selector = `.${side}-item[data-value="${value}"]`;
    return document.querySelector(selector);
  }

  removePair(pairToRemove: { left: number; right: string }, index: number) {
    // Remove from connected pairs
    this.connectedPairs = this.connectedPairs.filter(
      (pair) =>
        pair.left !== pairToRemove.left || pair.right !== pairToRemove.right
    );

    // Remove corresponding connection line
    if (this.connectionLines[index]) {
      this.connectionLines[index].remove();
      this.connectionLines.splice(index, 1);
    }
  }
}
