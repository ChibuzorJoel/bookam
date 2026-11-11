import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

/** What the server sends when the payment provider is Payaza (it has no hosted redirect with split support). */
export interface PayazaCheckoutConfig {
  merchantKey: string;
  mode: 'Live' | 'Test';
  reference: string;
  amount: number; // naira
  currency: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  billerName?: string;
  splitAccounts?: { code: string; ratio: number }[];
  additionalDetails?: Record<string, unknown>;
}

/** Fields shared by every "start a payment" response, whichever provider is active. */
export interface StartedPayment {
  provider?: 'paystack' | 'payaza';
  authorizationUrl: string | null;
  reference: string;
  checkout?: PayazaCheckoutConfig;
}

interface PayazaHandle {
  setCallback(fn: (response: unknown) => void): void;
  setOnClose(fn: () => void): void;
  showPopup(): void;
}
interface PayazaGlobal {
  setup(config: Record<string, unknown>): PayazaHandle;
}

const SCRIPT_URL = 'https://checkout-v2.payaza.africa/js/v1/bundle.js';

@Injectable({ providedIn: 'root' })
export class PayazaCheckout {
  private loading: Promise<PayazaGlobal> | null = null;

  constructor(@Inject(DOCUMENT) private readonly doc: Document) {}

  /**
   * Opens the Payaza popup. Resolves when the popup closes (paid or not). The caller must then ask OUR server to
   * verify the reference: the popup callback runs in the browser and proves nothing by itself.
   */
  async open(config: PayazaCheckoutConfig): Promise<void> {
    const sdk = await this.load();
    return new Promise<void>((resolve) => {
      const handle = sdk.setup({
        merchant_key: config.merchantKey,
        connection_mode: config.mode,
        checkout_amount: config.amount,
        currency_code: config.currency,
        email_address: config.email,
        first_name: config.firstName,
        last_name: config.lastName,
        phone_number: config.phone,
        transaction_reference: config.reference,
        ...(config.billerName ? { biller_name: config.billerName } : {}),
        ...(config.splitAccounts?.length ? { split_accounts: config.splitAccounts } : {}),
        ...(config.additionalDetails ? { additional_details: config.additionalDetails } : {}),
      });
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      handle.setCallback(finish);
      handle.setOnClose(finish);
      handle.showPopup();
    });
  }

  private load(): Promise<PayazaGlobal> {
    const win = this.doc.defaultView as (Window & { PayazaCheckout?: PayazaGlobal }) | null;
    if (win?.PayazaCheckout) {
      return Promise.resolve(win.PayazaCheckout);
    }
    if (!this.loading) {
      this.loading = new Promise<PayazaGlobal>((resolve, reject) => {
        const script = this.doc.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => {
          const g = (this.doc.defaultView as (Window & { PayazaCheckout?: PayazaGlobal }) | null)?.PayazaCheckout;
          g ? resolve(g) : reject(new Error('Payment window did not load.'));
        };
        script.onerror = () => {
          this.loading = null;
          reject(new Error('Could not load the payment window. Check your connection and try again.'));
        };
        this.doc.head.appendChild(script);
      });
    }
    return this.loading;
  }
}