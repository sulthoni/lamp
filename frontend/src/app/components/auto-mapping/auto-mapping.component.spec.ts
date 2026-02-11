import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutoMappingComponent } from './auto-mapping.component';

describe('AutoMappingComponent', () => {
  let component: AutoMappingComponent;
  let fixture: ComponentFixture<AutoMappingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutoMappingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AutoMappingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
