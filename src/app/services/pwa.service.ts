import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../core/api.config';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type PushState = 'unsupported' | 'off-server' | 'blocked' | 'off' | 'on';

/** "Add to home screen" and new-booking notifications for owners. Only used on the dashboard. */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly browser: boolean;
  private installEvent: BeforeInstallPromptEvent | null = null;
  private registration: ServiceWorkerRegistration | null = null;

  constructor(private readonly http: HttpClient, @Inject(PLATFORM_ID) platformId: object) {
    this.browser = isPlatformBrowser(platformId);
    if (this.browser) {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.installEvent = e as BeforeInstallPromptEvent;
      });
      window.addEventListener('appinstalled', () => (this.installEvent = null));
    }
  }

  /** Registers the service worker (safe to call more than once). */
  async init(): Promise<void> {
    if (!this.browser || !('serviceWorker' in navigator) || this.registration) {
      return;
    }
    try {
      this.registration = await navigator.serviceWorker.register('/sw.js');
    } catch {
      this.registration = null;
    }
  }

  get isInstalled(): boolean {
    return this.browser && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  }

  get canInstall(): boolean {
    return !!this.installEvent && !this.isInstalled;
  }

  /** iPhone Safari has no install button: the person must use Share, then Add to Home Screen. */
  get needsIosHint(): boolean {
    if (!this.browser || this.isInstalled) {
      return false;
    }
    const ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
  }

  async install(): Promise<boolean> {
    if (!this.installEvent) {
      return false;
    }
    await this.installEvent.prompt();
    const choice = await this.installEvent.userChoice;
    this.installEvent = null;
    return choice.outcome === 'accepted';
  }

  /* ---------------- Push ---------------- */
  async pushState(): Promise<PushState> {
    if (!this.browser || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return 'unsupported';
    }
    const key = await this.serverKey();
    if (!key.enabled) {
      return 'off-server';
    }
    if (Notification.permission === 'denied') {
      return 'blocked';
    }
    await this.init();
    const sub = await this.registration?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  }

  async enablePush(): Promise<PushState> {
    const key = await this.serverKey();
    if (!key.enabled || !key.publicKey) {
      return 'off-server';
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return permission === 'denied' ? 'blocked' : 'off';
    }
    await this.init();
    const reg = this.registration ?? (await navigator.serviceWorker.ready);
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.toKey(key.publicKey) }));
    await firstValueFrom(this.http.post(`${API_URL}/me/push`, sub.toJSON()));
    return 'on';
  }

  async disablePush(): Promise<void> {
    await this.init();
    const sub = await this.registration?.pushManager.getSubscription();
    if (!sub) {
      return;
    }
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await firstValueFrom(this.http.request('delete', `${API_URL}/me/push`, { body: { endpoint } })).catch(() => undefined);
  }

  sendTest(): Promise<unknown> {
    return firstValueFrom(this.http.post(`${API_URL}/me/push/test`, {}));
  }

  private async serverKey(): Promise<{ enabled: boolean; publicKey: string | null }> {
    try {
      const r = await firstValueFrom(this.http.get<{ data: { enabled: boolean; publicKey: string | null } }>(`${API_URL}/me/push/key`));
      return r.data;
    } catch {
      return { enabled: false, publicKey: null };
    }
  }

  private toKey(base64Url: string): ArrayBuffer {
    const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes.buffer;
  }
}