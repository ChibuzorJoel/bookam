import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PushState, PwaService } from '../../services/pwa.service';

/** "Get an alert on this phone for every new booking" + "Add Bookam to your home screen". */
@Component({
  selector: 'app-alerts-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="alerts" aria-labelledby="al-title">
      <h2 id="al-title" class="alerts__title"><i class="fa-solid fa-bell" aria-hidden="true"></i> Alerts on this phone</h2>

      <ng-container [ngSwitch]="state">
        <p *ngSwitchCase="'loading'" class="alerts__text">Checking...</p>
        <p *ngSwitchCase="'unsupported'" class="alerts__text">This browser cannot show alerts. On iPhone, add Bookam to your home screen first, then open it from there.</p>
        <p *ngSwitchCase="'off-server'" class="alerts__text">Alerts are not switched on for this site yet.</p>
        <p *ngSwitchCase="'blocked'" class="alerts__text">Alerts are blocked. Open your browser's site settings for this page and allow Notifications, then come back.</p>
        <ng-container *ngSwitchCase="'off'">
          <p class="alerts__text">Hear about every new booking and order without opening the app.</p>
          <button type="button" class="btn btn--primary btn--sm" (click)="enable()" [disabled]="busy">Turn on alerts</button>
        </ng-container>
        <ng-container *ngSwitchCase="'on'">
          <p class="alerts__text"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Alerts are on for this device.</p>
          <div class="alerts__row">
            <button type="button" class="btn btn--outline btn--sm" (click)="test()" [disabled]="busy">Send a test</button>
            <button type="button" class="link" (click)="disable()" [disabled]="busy">Turn off</button>
          </div>
        </ng-container>
      </ng-container>

      <p class="alerts__error" role="alert" *ngIf="message">{{ message }}</p>

      <div class="alerts__install" *ngIf="pwa.canInstall || pwa.needsIosHint">
        <p class="alerts__text" *ngIf="pwa.needsIosHint">To install: tap the Share button in Safari, then <strong>Add to Home Screen</strong>.</p>
        <button type="button" class="btn btn--outline btn--sm" *ngIf="pwa.canInstall" (click)="install()">Add Bookam to home screen</button>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .alerts {
        background: #fff;
        border: 1px solid rgba(8, 48, 45, 0.12);
        border-radius: 18px;
        padding: 16px 18px;
        margin-bottom: 16px;
        color: #0b2b28;
      }
      .alerts__title {
        margin: 0 0 8px;
        font-size: 1.05rem;
        color: #08302d;
      }
      .alerts__text {
        margin: 0 0 10px;
        font-size: 0.92rem;
        color: #4a625f;
      }
      .alerts__row {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .alerts__error {
        color: #b42318;
        font-weight: 600;
        margin: 8px 0 0;
        font-size: 0.9rem;
      }
      .alerts__install {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(8, 48, 45, 0.1);
      }
      .btn {
        font: inherit;
        font-weight: 800;
        padding: 8px 16px;
        border-radius: 999px;
        cursor: pointer;
        border: 2px solid #08302d;
      }
      .btn--primary {
        background: #08302d;
        color: #fff;
      }
      .btn--outline {
        background: transparent;
        color: #08302d;
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .btn:focus-visible,
      .link:focus-visible {
        outline: 3px solid #ffc21a;
        outline-offset: 2px;
      }
      .link {
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        font-weight: 800;
        text-decoration: underline;
        color: #0e7c3f;
        cursor: pointer;
      }
    `,
  ],
})
export class AlertsCardComponent implements OnInit {
  state: PushState | 'loading' = 'loading';
  busy = false;
  message = '';

  constructor(readonly pwa: PwaService, private readonly cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    await this.pwa.init();
    this.state = await this.pwa.pushState();
    this.cdr.markForCheck();
  }

  async enable(): Promise<void> {
    await this.run(async () => (this.state = await this.pwa.enablePush()), 'We could not turn alerts on. Please try again.');
  }

  async disable(): Promise<void> {
    await this.run(async () => {
      await this.pwa.disablePush();
      this.state = 'off';
    }, 'We could not turn alerts off. Please try again.');
  }

  async test(): Promise<void> {
    await this.run(async () => {
      await this.pwa.sendTest();
      this.message = '';
    }, 'The test did not go through. Please try again.');
  }

  async install(): Promise<void> {
    await this.run(async () => {
      await this.pwa.install();
    }, 'Could not add to the home screen.');
  }

  private async run(job: () => Promise<unknown>, failure: string): Promise<void> {
    this.busy = true;
    this.message = '';
    this.cdr.markForCheck();
    try {
      await job();
    } catch {
      this.message = failure;
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}