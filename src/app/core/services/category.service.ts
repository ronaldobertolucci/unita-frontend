import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CategoryDto,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly _categories = signal<CategoryDto[]>([]);
  readonly categories = this._categories.asReadonly();

  // ─── Listagem ─────────────────────────────────────────────────────────────

  loadCategories(): Observable<CategoryDto[]> {
    return this.http.get<CategoryDto[]>(`${this.base}/categories`).pipe(
      tap(list => this._categories.set(list))
    );
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  create(payload: CreateCategoryPayload): Observable<CategoryDto> {
    return this.http.post<CategoryDto>(`${this.base}/categories`, payload).pipe(
      tap(created => this._categories.update(list => [...list, created]))
    );
  }

  update(id: number, payload: UpdateCategoryPayload): Observable<CategoryDto> {
    return this.http.patch<CategoryDto>(`${this.base}/categories/${id}`, payload).pipe(
      tap(updated => this._categories.update(list =>
        list.map(c => c.id === id ? updated : c)
      ))
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/categories/${id}`).pipe(
      tap(() => this._categories.update(list => list.filter(c => c.id !== id)))
    );
  }
}