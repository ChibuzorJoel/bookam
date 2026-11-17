import { TestBed } from '@angular/core/testing';

import { AdminExtraService } from './admin-extra.service';

describe('AdminExtraService', () => {
  let service: AdminExtraService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AdminExtraService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
