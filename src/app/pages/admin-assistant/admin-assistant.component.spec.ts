import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminAssistantComponent } from './admin-assistant.component';

describe('AdminAssistantComponent', () => {
  let component: AdminAssistantComponent;
  let fixture: ComponentFixture<AdminAssistantComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AdminAssistantComponent]
    });
    fixture = TestBed.createComponent(AdminAssistantComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
