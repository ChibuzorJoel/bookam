import { ChangeDetectionStrategy, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

import { Block, DOCS, LEGAL, LegalDoc } from '../../core/legal.content';

/** One component for /terms, /privacy and /refunds. The route's data.doc picks which text to show. */
@Component({
  selector: 'app-legal',
  templateUrl: './legal.component.html',
  styleUrls: ['./legal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalComponent implements OnInit, OnDestroy {
  readonly legal = LEGAL;
  readonly tabs = [
    { path: '/terms', label: 'Terms of Use', key: 'terms' },
    { path: '/privacy', label: 'Privacy Policy', key: 'privacy' },
    { path: '/refunds', label: 'Refund Policy', key: 'refunds' },
  ] as const;

  doc: LegalDoc = DOCS.terms;
  private sub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly doc$: Document
  ) {}

  ngOnInit(): void {
    this.sub = this.route.data.subscribe((d) => {
      this.doc = DOCS[(d['doc'] as LegalDoc['key']) ?? 'terms'];
      this.title.setTitle(`${this.doc.title} | LagosPages`);
      this.meta.updateTag({ name: 'description', content: this.doc.lead.slice(0, 155) });
      this.doc$.defaultView?.scrollTo?.(0, 0);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  isList(b: Block): b is { list: string[] } {
    return typeof b !== 'string';
  }

  asText(b: Block): string {
    return typeof b === 'string' ? b : '';
  }

  asList(b: Block): string[] {
    return typeof b === 'string' ? [] : b.list;
  }
}