import { TestBed } from '@angular/core/testing';

import { AutoMappingService } from './auto-mapping.service';

describe('AutoMappingService', () => {
  let service: AutoMappingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AutoMappingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
