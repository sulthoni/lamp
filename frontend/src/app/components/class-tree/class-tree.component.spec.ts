import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClassTreeComponent } from './class-tree.component';

describe('ClassTreeComponent', () => {
  let component: ClassTreeComponent;
  let fixture: ComponentFixture<ClassTreeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClassTreeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClassTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
