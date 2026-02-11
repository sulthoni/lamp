import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DbconfigComponent } from './dbconfig.component';

describe('DbconfigComponent', () => {
  let component: DbconfigComponent;
  let fixture: ComponentFixture<DbconfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DbconfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DbconfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
