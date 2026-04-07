import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CardBrandDto,
  CreditCardBillDto,
  CreditCardDto,
  CreditCardInstallmentDto,
  CreditCardPurchaseDto,
  CreditCardRefundDto,
  BillStatementDto,
  CreateCreditCardPayload,
  CreateInstallmentPayload,
  CreatePurchasePayload,
  CreateRefundPayload,
  PayBillPayload,
  UpdateCreditCardPayload,
  UpdateInstallmentPayload,
} from '../models/credit-card.model';

// ─── Dados de referência hardcoded ───────────────────────────────────────────

export const CARD_BRANDS: CardBrandDto[] = [
  { id: 1, name: 'Visa' },
  { id: 2, name: 'Mastercard' },
  { id: 3, name: 'Elo' },
  { id: 4, name: 'American Express' },
  { id: 5, name: 'Hipercard' },
];

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CreditCardService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly _creditCards = signal<CreditCardDto[]>([]);
  readonly creditCards = this._creditCards.asReadonly();

  // ─── Cartões ─────────────────────────────────────────────────────────────

  loadCreditCards(): Observable<CreditCardDto[]> {
    return this.http.get<CreditCardDto[]>(`${this.base}/credit-cards/my`).pipe(
      tap(list => this._creditCards.set(list))
    );
  }

  getCreditCard(id: number): Observable<CreditCardDto> {
    return this.http.get<CreditCardDto>(`${this.base}/credit-cards/${id}`);
  }

  createCreditCard(payload: CreateCreditCardPayload): Observable<CreditCardDto> {
    return this.http.post<CreditCardDto>(`${this.base}/credit-cards`, payload).pipe(
      tap(card => this._creditCards.update(list => [...list, card]))
    );
  }

  updateCreditCard(id: number, payload: UpdateCreditCardPayload): Observable<CreditCardDto> {
    return this.http.patch<CreditCardDto>(`${this.base}/credit-cards/${id}`, payload).pipe(
      tap(updated => this._creditCards.update(list =>
        list.map(c => c.id === id ? updated : c)
      ))
    );
  }

  deleteCreditCard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/credit-cards/${id}`).pipe(
      tap(() => this._creditCards.update(list => list.filter(c => c.id !== id)))
    );
  }

  // ─── Faturas ─────────────────────────────────────────────────────────────

  getBills(cardId: number): Observable<CreditCardBillDto[]> {
    return this.http.get<CreditCardBillDto[]>(`${this.base}/credit-cards/${cardId}/bills`);
  }

  getBill(cardId: number, billId: number): Observable<CreditCardBillDto> {
    return this.http.get<CreditCardBillDto>(`${this.base}/credit-cards/${cardId}/bills/${billId}`);
  }

  getBillStatement(cardId: number, billId: number): Observable<BillStatementDto> {
    return this.http.get<BillStatementDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/installments`
    );
  }

  closeBill(cardId: number, billId: number): Observable<CreditCardBillDto> {
    return this.http.put<CreditCardBillDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/close`,
      {}
    );
  }

  reopenBill(cardId: number, billId: number): Observable<CreditCardBillDto> {
    return this.http.put<CreditCardBillDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/reopen`,
      {}
    );
  }

  payBill(cardId: number, billId: number, payload: PayBillPayload): Observable<CreditCardBillDto> {
    return this.http.put<CreditCardBillDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/pay`,
      payload
    );
  }

  // ─── Compras ─────────────────────────────────────────────────────────────

  getPurchases(cardId: number): Observable<CreditCardPurchaseDto[]> {
    return this.http.get<CreditCardPurchaseDto[]>(
      `${this.base}/credit-cards/${cardId}/purchases`
    );
  }

  createPurchase(cardId: number, payload: CreatePurchasePayload): Observable<CreditCardPurchaseDto> {
    return this.http.post<CreditCardPurchaseDto>(
      `${this.base}/credit-cards/${cardId}/purchases`,
      payload
    );
  }

  deletePurchase(cardId: number, purchaseId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}`
    );
  }

  // ─── Parcelas ────────────────────────────────────────────────────────────

  getInstallments(cardId: number, purchaseId: number): Observable<CreditCardInstallmentDto[]> {
    return this.http.get<CreditCardInstallmentDto[]>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}/installments`
    );
  }

  createInstallment(
    cardId: number,
    purchaseId: number,
    payload: CreateInstallmentPayload
  ): Observable<CreditCardInstallmentDto> {
    return this.http.post<CreditCardInstallmentDto>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}/installments`,
      payload
    );
  }

  updateInstallment(
    cardId: number,
    purchaseId: number,
    installmentId: number,
    payload: UpdateInstallmentPayload
  ): Observable<CreditCardInstallmentDto> {
    return this.http.put<CreditCardInstallmentDto>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}/installments/${installmentId}`,
      payload
    );
  }

  deleteInstallment(
    cardId: number,
    purchaseId: number,
    installmentId: number
  ): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}/installments/${installmentId}`
    );
  }

  // ─── Estornos ────────────────────────────────────────────────────────────

  getRefunds(cardId: number, billId: number): Observable<CreditCardRefundDto[]> {
    return this.http.get<CreditCardRefundDto[]>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/refunds`
    );
  }

  createRefund(
    cardId: number,
    billId: number,
    payload: CreateRefundPayload
  ): Observable<CreditCardRefundDto> {
    return this.http.post<CreditCardRefundDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/refunds`,
      payload
    );
  }

  deleteRefund(cardId: number, billId: number, refundId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/refunds/${refundId}`
    );
  }
}