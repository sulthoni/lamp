import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MappingTableToOntologyComponent } from './mapping-table-to-ontology.component';

describe('MappingTableToOntologyComponent', () => {
  let component: MappingTableToOntologyComponent;
  let fixture: ComponentFixture<MappingTableToOntologyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MappingTableToOntologyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MappingTableToOntologyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
