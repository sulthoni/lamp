import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TurtleBrowserComponent } from './turtle-browser.component';

describe('TurtleBrowserComponent', () => {
  let component: TurtleBrowserComponent;
  let fixture: ComponentFixture<TurtleBrowserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TurtleBrowserComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TurtleBrowserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
