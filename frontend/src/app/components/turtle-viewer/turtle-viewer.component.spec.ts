import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TurtleViewerComponent } from './turtle-viewer.component';

describe('TurtleViewerComponent', () => {
  let component: TurtleViewerComponent;
  let fixture: ComponentFixture<TurtleViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TurtleViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TurtleViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
