import { inject, Injectable, signal, DestroyRef } from '@angular/core';
import { SessionService } from './session.service';
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
  CreatePurchasePayload,
  CreateRefundPayload,
  PayBillPayload,
  UpdateCreditCardPayload,
  UpdateInstallmentPayload,
} from '../models/credit-card.model';

// ─── Dados de referência hardcoded ───────────────────────────────────────────

export const CARD_BRANDS: CardBrandDto[] = [
  { id: 4, name: 'American Express' },
  { id: 3, name: 'Elo' },
  { id: 5, name: 'Hipercard' },
  { id: 2, name: 'Mastercard' },
  { id: 1, name: 'Visa' },
];

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CreditCardService {
  private readonly session = inject(SessionService);
  private readonly sessionCleanup = this.session.registerCleanup(() => { this._creditCards.set([]); }, inject(DestroyRef));

  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly _creditCards = signal<CreditCardDto[]>([]);
  readonly creditCards = this._creditCards.asReadonly();

  // ─── Cartões ─────────────────────────────────────────────────────────────

  loadCreditCards(): Observable<CreditCardDto[]> {
    return this.session.scoped(() => this.http.get<CreditCardDto[]>(`${this.base}/credit-cards/my`)).pipe(
      tap(list => this._creditCards.set(this.sort(list)))
    );
  }

  getCreditCard(id: number): Observable<CreditCardDto> {
    return this.session.scoped(() => this.http.get<CreditCardDto>(`${this.base}/credit-cards/${id}`));
  }

  createCreditCard(payload: CreateCreditCardPayload): Observable<CreditCardDto> {
    return this.session.scoped(() => this.http.post<CreditCardDto>(`${this.base}/credit-cards`, payload)).pipe(
      tap(card => this._creditCards.update(list => this.sort([...list, card])))
    );
  }

  updateCreditCard(id: number, payload: UpdateCreditCardPayload): Observable<CreditCardDto> {
    return this.session.scoped(() => this.http.patch<CreditCardDto>(`${this.base}/credit-cards/${id}`, payload)).pipe(
      tap(updated => this._creditCards.update(list =>
        this.sort(list.map(c => c.id === id ? updated : c))
      ))
    );
  }

  deleteCreditCard(id: number): Observable<void> {
    return this.session.scoped(() => this.http.delete<void>(`${this.base}/credit-cards/${id}`)).pipe(
      tap(() => this._creditCards.update(list => list.filter(c => c.id !== id)))
    );
  }

  private sort(list: CreditCardDto[]): CreditCardDto[] {
    return [...list].sort((a, b) => a.legalEntityCorporateName.localeCompare(b.legalEntityCorporateName, 'pt-BR'));
  }

  // ─── Faturas ─────────────────────────────────────────────────────────────

  getBills(cardId: number): Observable<CreditCardBillDto[]> {
    return this.session.scoped(() => this.http.get<CreditCardBillDto[]>(`${this.base}/credit-cards/${cardId}/bills`));
  }

  getBill(cardId: number, billId: number): Observable<CreditCardBillDto> {
    return this.session.scoped(() => this.http.get<CreditCardBillDto>(`${this.base}/credit-cards/${cardId}/bills/${billId}`));
  }

  getBillStatement(cardId: number, billId: number): Observable<BillStatementDto> {
    return this.session.scoped(() => this.http.get<BillStatementDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/installments`
    ));
  }

  closeBill(cardId: number, billId: number): Observable<CreditCardBillDto> {
    return this.session.scoped(() => this.http.put<CreditCardBillDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/close`,
      null
    ));
  }

  reopenBill(cardId: number, billId: number): Observable<CreditCardBillDto> {
    return this.session.scoped(() => this.http.put<CreditCardBillDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/reopen`,
      null
    ));
  }

  payBill(cardId: number, billId: number, payload: PayBillPayload): Observable<CreditCardBillDto> {
    return this.session.scoped(() => this.http.put<CreditCardBillDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/pay`,
      payload
    ));
  }

  // ─── Compras ─────────────────────────────────────────────────────────────

  getPurchases(cardId: number): Observable<CreditCardPurchaseDto[]> {
    return this.session.scoped(() => this.http.get<CreditCardPurchaseDto[]>(
      `${this.base}/credit-cards/${cardId}/purchases`
    ));
  }

  createPurchase(cardId: number, payload: CreatePurchasePayload): Observable<CreditCardPurchaseDto> {
    return this.session.scoped(() => this.http.post<CreditCardPurchaseDto>(
      `${this.base}/credit-cards/${cardId}/purchases`,
      payload
    ));
  }

  getPurchase(cardId: number, purchaseId: number): Observable<CreditCardPurchaseDto> {
    return this.session.scoped(() => this.http.get<CreditCardPurchaseDto>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}`
    ));
  }

  updatePurchase(cardId: number, purchaseId: number, payload: CreatePurchasePayload): Observable<CreditCardPurchaseDto> {
    return this.session.scoped(() => this.http.put<CreditCardPurchaseDto>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}`, payload
    ));
  }

  deletePurchase(cardId: number, purchaseId: number): Observable<void> {
    return this.session.scoped(() => this.http.delete<void>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}`
    ));
  }

  // ─── Parcelas ────────────────────────────────────────────────────────────

  getInstallments(cardId: number, purchaseId: number): Observable<CreditCardInstallmentDto[]> {
    return this.session.scoped(() => this.http.get<CreditCardInstallmentDto[]>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}/installments`
    ));
  }

  updateInstallment(
    cardId: number,
    purchaseId: number,
    installmentId: number,
    payload: UpdateInstallmentPayload
  ): Observable<CreditCardInstallmentDto> {
    return this.session.scoped(() => this.http.put<CreditCardInstallmentDto>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}/installments/${installmentId}`,
      payload
    ));
  }

  deleteInstallment(
    cardId: number,
    purchaseId: number,
    installmentId: number
  ): Observable<void> {
    return this.session.scoped(() => this.http.delete<void>(
      `${this.base}/credit-cards/${cardId}/purchases/${purchaseId}/installments/${installmentId}`
    ));
  }

  // ─── Estornos ────────────────────────────────────────────────────────────

  getRefunds(cardId: number, billId: number): Observable<CreditCardRefundDto[]> {
    return this.session.scoped(() => this.http.get<CreditCardRefundDto[]>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/refunds`
    ));
  }

  createRefund(
    cardId: number,
    billId: number,
    payload: CreateRefundPayload
  ): Observable<CreditCardRefundDto> {
    return this.session.scoped(() => this.http.post<CreditCardRefundDto>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/refunds`,
      payload
    ));
  }

  deleteRefund(cardId: number, billId: number, refundId: number): Observable<void> {
    return this.session.scoped(() => this.http.delete<void>(
      `${this.base}/credit-cards/${cardId}/bills/${billId}/refunds/${refundId}`
    ));
  }
}
