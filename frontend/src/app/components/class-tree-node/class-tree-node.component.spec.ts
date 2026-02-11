import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClassTreeNodeComponent } from './class-tree-node.component';

describe('ClassTreeNodeComponent', () => {
  let component: ClassTreeNodeComponent;
  let fixture: ComponentFixture<ClassTreeNodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClassTreeNodeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClassTreeNodeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
