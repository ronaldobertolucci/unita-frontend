import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription, finalize } from 'rxjs';
import { RecurringBill, RecurringBillPage, RecurringBillPayload, RecurringFrequency, RecurringOccurrence } from '../../core/models/recurring-bill.model';
import { RecurringBillService, RecurringRecovery } from '../../core/services/recurring-bill.service';
import { PageContextService } from '../../core/services/page-context.service';
import { SessionService } from '../../core/services/session.service';
import { isUncertainCreation } from '../../core/utils/registration-error.util';
import { amountValidator, localDateValidator, reminderValidator, validMonth } from './recurring-bill.validators';

@Component({
  selector: 'app-recurring-bills', standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './recurring-bills.component.html', styleUrl: './recurring-bills.component.css',
})
export class RecurringBillsComponent implements OnInit, OnDestroy {
  private readonly api = inject(RecurringBillService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context = inject(PageContextService);
  private readonly session = inject(SessionService);
  private listRequest?: Subscription;
  private upcomingRequest?: Subscription;
  private operation = 0;
  private inFlightWrite: RecurringRecovery | null = null;
  readonly recovery = this.api.recovery;
  readonly page = signal<RecurringBillPage | null>(null);
  readonly occurrences = signal<RecurringOccurrence[]>([]);
  readonly loadingList = signal(false);
  readonly loadingUpcoming = signal(false);
  readonly busy = signal(false);
  readonly editorOpen = signal(false);
  readonly editing = signal<RecurringBill | null>(null);
  readonly latest = signal<RecurringBill | null>(null);
  readonly reviewing = signal(false);
  readonly frequencyLocked = signal(false);
  readonly creationChecked = signal(false);
  readonly error = signal('');
  readonly listError = signal('');
  readonly upcomingError = signal('');
  readonly success = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly filter = signal('all');
  readonly month = signal(new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).format(new Date()).slice(0, 7));
  readonly fields = ['description', 'expectedAmount', 'frequency', 'firstDueDate', 'reminderDaysBefore', 'emailEnabled', 'active', 'notes'] as const;
  readonly labels: Record<string, string> = {
    description: 'Descrição', expectedAmount: 'Valor previsto', frequency: 'Frequência', firstDueDate: 'Âncora original',
    reminderDaysBefore: 'Antecedência (dias)', emailEnabled: 'E-mail', active: 'Recorrência', notes: 'Notas',
  };
  readonly form = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(255), Validators.pattern(/\S/)]],
    expectedAmount: ['', amountValidator], frequency: ['MONTHLY' as RecurringFrequency, Validators.pattern(/^(MONTHLY|YEARLY)$/)],
    firstDueDate: ['', localDateValidator], reminderDaysBefore: [3, reminderValidator],
    emailEnabled: [true], active: [true], notes: ['', Validators.maxLength(2000)],
  });

  constructor() {
    this.session.registerCleanup(() => {
      this.inFlightWrite = null;
      this.page.set(null); this.occurrences.set([]); this.editorOpen.set(false);
      this.editing.set(null); this.latest.set(null); this.form.reset();
      this.error.set(''); this.success.set(''); this.fieldErrors.set({});
    }, this.destroyRef);
  }
  ngOnInit(): void {
    this.context.clear();
    this.context.pageSubtitle.set('Compromissos pessoais e vencimentos previstos');
    this.context.ctaLabel.set('Nova recorrência');
    this.context.ctaCallback.set(() => this.openCreate());
    if (this.recovery()) this.checkRecovery();
    else { this.loadList(); this.loadUpcoming(); }
  }
  ngOnDestroy(): void {
    // Leaving while a write is in flight loses its response, not necessarily its server result.
    if (this.inFlightWrite) this.api.recovery.set(this.inFlightWrite);
    this.context.clear();
  }

  private watch<T>(request: Observable<T>, next: (value: T) => void, error: (err: HttpErrorResponse) => void): void {
    const operation = ++this.operation;
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      if (operation === this.operation) this.busy.set(false);
    })).subscribe({ next, error });
  }
  loadList(page = 0): void {
    this.listRequest?.unsubscribe();
    this.loadingList.set(true); this.listError.set(''); this.page.set(null);
    if (this.recovery()?.kind === 'create') this.creationChecked.set(false);
    const active = this.filter() === 'all' ? undefined : this.filter() === 'active';
    this.listRequest = this.api.list(page, active).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loadingList.set(false))).subscribe({
      next: value => {
        if (page > 0 && !value.content.length) { this.loadList(Math.max(0, value.totalPages - 1)); return; }
        this.page.set(value);
        if (this.recovery()?.kind === 'create') this.creationChecked.set(true);
      },
      error: () => this.listError.set('Não foi possível consultar os cadastros. Atualize a lista.'),
    });
  }
  changeFilter(value: string): void { this.filter.set(value); this.loadList(); }
  changeMonth(value: string): void { this.month.set(value); this.loadUpcoming(); }
  loadUpcoming(): void {
    this.upcomingRequest?.unsubscribe(); this.occurrences.set([]); this.upcomingError.set('');
    if (!validMonth(this.month())) { this.upcomingError.set('Selecione um mês entre 1900 e 9998.'); return; }
    this.loadingUpcoming.set(true);
    this.upcomingRequest = this.api.upcoming(this.month()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loadingUpcoming.set(false))).subscribe({
      next: value => this.occurrences.set(value),
      error: () => this.upcomingError.set('Não foi possível consultar as previsões. Tente atualizar.'),
    });
  }
  openCreate(): void {
    if (this.busy() || this.recovery()) return;
    this.form.reset(); this.editing.set(null); this.latest.set(null); this.reviewing.set(false);
    this.frequencyLocked.set(false); this.error.set(''); this.success.set(''); this.fieldErrors.set({}); this.editorOpen.set(true);
  }
  edit(id: number): void {
    if (this.busy() || this.recovery()) return;
    this.error.set(''); this.success.set('');
    this.watch(this.api.detail(id), value => {
      this.editing.set(value); this.latest.set(null); this.reviewing.set(false); this.frequencyLocked.set(false);
      this.fill(value); this.fieldErrors.set({}); this.editorOpen.set(true);
    }, error => this.handleReadError(error));
  }
  closeEditor(): void { if (!this.busy() && !this.recovery()) this.editorOpen.set(false); }
  private fill(value: RecurringBillPayload): void {
    this.form.reset({ ...value, expectedAmount: value.expectedAmount === null ? '' : String(value.expectedAmount), notes: value.notes ?? '' });
  }
  payload(): RecurringBillPayload {
    const value = this.form.getRawValue();
    return { ...value, description: value.description.trim(),
      expectedAmount: value.expectedAmount.trim() ? Number(value.expectedAmount.trim().replace(',', '.')) : null,
      notes: value.notes || null };
  }
  save(): void {
    if (this.busy() || this.recovery() || this.reviewing()) return;
    this.form.markAllAsTouched(); this.error.set(''); this.fieldErrors.set({});
    if (this.form.invalid) return;
    const draft = this.payload(); const current = this.editing();
    this.inFlightWrite = current ? { kind: 'update', id: current.id, draft, frequencyLocked: false } : { kind: 'create' };
    this.watch(current ? this.api.update(current.id, draft, current.version) : this.api.create(draft), value => {
      this.inFlightWrite = null;
      this.editing.set(value); this.editorOpen.set(false); this.success.set('Recorrência salva.');
      this.loadList(this.page()?.page ?? 0); this.loadUpcoming();
    }, error => {
      this.inFlightWrite = null;
      if (error.status === 404) { this.handleReadError(error); return; }
      if (current && error.status === 409) {
        const locked = error.error?.message === 'Frequency cannot change after sending has started';
        this.error.set(locked ? 'A frequência não pode mudar: já houve reserva ou tentativa de envio. Revise as outras alterações.' : 'Este cadastro foi alterado. Compare a versão atual com suas alterações antes de salvar.');
        this.api.recovery.set({ kind: 'update', id: current.id, draft, frequencyLocked: locked });
        this.checkRecovery();
      } else if (isUncertainCreation(error)) {
        this.error.set('A resposta não confirmou o resultado. Consulte e revise os dados antes de tentar uma nova escrita.');
        this.api.recovery.set(current ? { kind: 'update', id: current.id, draft, frequencyLocked: false } : { kind: 'create' });
        this.checkRecovery();
      } else if (error.status === 400) {
        const fields: Record<string, string> = {};
        for (const item of error.error?.errors ?? []) {
          if (item && this.form.get(item.field)) fields[item.field] = 'Confira o valor informado para este campo.';
        }
        this.fieldErrors.set(fields);
        this.error.set('Dados inválidos. Confira os campos e os limites informados.');
      } else this.error.set(error.status === 403 ? 'Sua conta não tem acesso a esta operação.' : 'Não foi possível salvar a recorrência.');
    });
  }
  checkRecovery(): void {
    const state = this.recovery(); if (!state) return;
    if (state.kind === 'create') {
      this.creationChecked.set(false); this.editorOpen.set(false); this.filter.set('all'); this.loadList(); this.loadUpcoming();
    } else {
      this.editorOpen.set(true); this.reviewing.set(true); this.latest.set(null);
      this.fill(state.draft); this.frequencyLocked.set(state.frequencyLocked);
      this.watch(this.api.detail(state.id), value => { this.latest.set(value); this.loadList(); this.loadUpcoming(); }, error => this.handleReadError(error));
    }
  }
  confirmCreationReview(): void {
    if (this.recovery()?.kind !== 'create' || !this.creationChecked() || this.loadingList()) return;
    this.api.recovery.set(null); this.error.set(''); this.success.set('Consulta revisada. Novos cadastros estão disponíveis.');
  }
  useLatest(): void {
    const value = this.latest(); if (!value || this.busy()) return;
    this.fill(value); this.finishReview(value);
  }
  keepDraft(): void {
    const value = this.latest(); if (!value || this.busy()) return;
    if (this.frequencyLocked()) this.form.controls.frequency.setValue(value.frequency);
    this.finishReview(value);
  }
  private finishReview(value: RecurringBill): void {
    this.editing.set(value); this.latest.set(null); this.reviewing.set(false); this.api.recovery.set(null); this.error.set('');
    this.success.set('Versão revisada. Confira o formulário e salve para confirmar suas alterações.');
  }
  private handleReadError(error: HttpErrorResponse): void {
    if (error.status === 404) {
      this.editorOpen.set(false); this.editing.set(null); this.latest.set(null); this.reviewing.set(false);
      this.api.recovery.set(null); this.error.set('Cadastro indisponível. A lista será atualizada.'); this.loadList(); this.loadUpcoming();
    } else this.error.set('Não foi possível consultar o detalhe. Tente consultar novamente.');
  }
  fieldError(field: string): string {
    if (this.fieldErrors()[field]) return this.fieldErrors()[field];
    const control = this.form.get(field);
    if (!control?.touched || !control.invalid) return '';
    const messages: Record<string, string> = {
      description: 'Informe uma descrição de até 255 caracteres.', expectedAmount: 'Use um valor maior que zero, até 13 dígitos inteiros e 2 decimais, ou deixe vazio.',
      firstDueDate: 'Informe uma data válida entre 1900 e 9998.', reminderDaysBefore: 'Informe um número inteiro entre 0 e 30.',
      notes: 'Use até 2000 caracteres.', frequency: 'Selecione mensal ou anual.',
    };
    return messages[field] ?? 'Confira este campo.';
  }
  dateLabel(value: string): string { return value.split('-').reverse().join('/'); }
  amountLabel(value: number | null): string {
    return value === null ? 'não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
  display(field: string, value: RecurringBillPayload): string {
    if (field === 'expectedAmount') return this.amountLabel(value.expectedAmount);
    if (field === 'firstDueDate') return this.dateLabel(value.firstDueDate);
    if (field === 'frequency') return value.frequency === 'MONTHLY' ? 'Mensal' : 'Anual';
    if (field === 'active') return value.active ? 'Ativa' : 'Pausada';
    if (field === 'emailEnabled') return value.emailEnabled ? 'Ligado' : 'Desligado';
    return String(value[field as keyof RecurringBillPayload] ?? 'não informado');
  }
}
