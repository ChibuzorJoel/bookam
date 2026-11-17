import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService } from './auth.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatLink {
  label: string;
  path: string;
  query?: Record<string, string>;
  fragment?: string;
}

export interface ChatReply {
  reply: string;
  links: ChatLink[];
  available: boolean;
}

export interface KnowledgeEntry {
  _id: string;
  question: string;
  answer: string;
  active: boolean;
}

export interface KnowledgeGap {
  _id: string;
  question: string;
  count: number;
  lastAskedAt: string;
}

export interface AssistantUsage {
  configured: boolean;
  dailyCap: number;
  model: string;
  days: { day: string; messages: number; unanswered: number }[];
}

interface Envelope<T> {
  status: 'success';
  data: T;
}

/** Public chat endpoint, plus the admin endpoints that teach the assistant. */
@Injectable({ providedIn: 'root' })
export class AssistantApi {
  constructor(private readonly http: HttpClient) {}

  chat(messages: ChatTurn[]): Observable<ChatReply> {
    return this.http.post<Envelope<ChatReply>>(`${API_URL}/public/assistant`, { messages }).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  knowledge(): Observable<KnowledgeEntry[]> {
    return this.http.get<Envelope<{ entries: KnowledgeEntry[] }>>(`${API_URL}/admin/knowledge`).pipe(
      map((r) => r.data.entries),
      catchError((e) => this.fail(e))
    );
  }

  addKnowledge(body: { question: string; answer: string }): Observable<KnowledgeEntry> {
    return this.http.post<Envelope<{ entry: KnowledgeEntry }>>(`${API_URL}/admin/knowledge`, body).pipe(
      map((r) => r.data.entry),
      catchError((e) => this.fail(e))
    );
  }

  updateKnowledge(id: string, body: Partial<Pick<KnowledgeEntry, 'question' | 'answer' | 'active'>>): Observable<KnowledgeEntry> {
    return this.http.patch<Envelope<{ entry: KnowledgeEntry }>>(`${API_URL}/admin/knowledge/${id}`, body).pipe(
      map((r) => r.data.entry),
      catchError((e) => this.fail(e))
    );
  }

  deleteKnowledge(id: string): Observable<void> {
    return this.http.delete<Envelope<unknown>>(`${API_URL}/admin/knowledge/${id}`).pipe(
      map(() => undefined),
      catchError((e) => this.fail(e))
    );
  }

  gaps(): Observable<KnowledgeGap[]> {
    return this.http.get<Envelope<{ gaps: KnowledgeGap[] }>>(`${API_URL}/admin/assistant/gaps`).pipe(
      map((r) => r.data.gaps),
      catchError((e) => this.fail(e))
    );
  }

  answerGap(id: string, answer: string, question?: string): Observable<KnowledgeEntry> {
    return this.http.patch<Envelope<{ entry: KnowledgeEntry }>>(`${API_URL}/admin/assistant/gaps/${id}`, { action: 'answer', answer, question }).pipe(
      map((r) => r.data.entry),
      catchError((e) => this.fail(e))
    );
  }

  ignoreGap(id: string): Observable<void> {
    return this.http.patch<Envelope<unknown>>(`${API_URL}/admin/assistant/gaps/${id}`, { action: 'ignore' }).pipe(
      map(() => undefined),
      catchError((e) => this.fail(e))
    );
  }

  usage(): Observable<AssistantUsage> {
    return this.http.get<Envelope<AssistantUsage>>(`${API_URL}/admin/assistant/usage`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err));
  }
}