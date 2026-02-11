import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BuildLocalOntologyComponent } from './build-local-ontology.component';

describe('BuildLocalOntologyComponent', () => {
  let component: BuildLocalOntologyComponent;
  let fixture: ComponentFixture<BuildLocalOntologyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BuildLocalOntologyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BuildLocalOntologyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
