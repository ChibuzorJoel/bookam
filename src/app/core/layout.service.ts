import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Lets a page hide the LagosPages header and footer. Customer-facing business pages call
 * `hideChrome(true)` so shoppers see the business's brand, not the platform's marketing bar.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly subject = new BehaviorSubject<boolean>(false);
  readonly hideChrome$ = this.subject.asObservable();

  hideChrome(hide: boolean): void {
    this.subject.next(hide);
  }
}