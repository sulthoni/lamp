import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OntologyClassParserComponent } from './ontology-class-parser.component';

describe('OntologyClassParserComponent', () => {
  let component: OntologyClassParserComponent;
  let fixture: ComponentFixture<OntologyClassParserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OntologyClassParserComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OntologyClassParserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
