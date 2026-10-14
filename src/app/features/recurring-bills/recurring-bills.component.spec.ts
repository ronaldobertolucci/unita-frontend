import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RecurringBillsComponent } from './recurring-bills.component';
import { RecurringBill } from '../../core/models/recurring-bill.model';
import { RecurringBillService } from '../../core/services/recurring-bill.service';
import { PageContextService } from '../../core/services/page-context.service';
import { SessionService } from '../../core/services/session.service';
import { syntheticSession } from '../../core/testing/session.mock';
import { environment } from '../../../environments/environment';

const bill: RecurringBill = {
  id: 7, version: 0, description: 'Internet', expectedAmount: 129.9, frequency: 'MONTHLY',
  firstDueDate: '2026-01-31', reminderDaysBefore: 3, emailEnabled: true, active: true,
  notes: 'Reajuste', createdAt: '2026-10-13T12:00:00Z', updatedAt: '2026-10-13T12:00:00Z',
};
describe('US-07 recurring panel', () => {
  let fixture: ComponentFixture<RecurringBillsComponent>;
  let c: RecurringBillsComponent;
  let http: HttpTestingController;
  let session: SessionService;
  const url = `${environment.apiUrl}/recurring-bills`;
  // jsdom does not implement the native dialog API.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
  });
  afterAll(() => {
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  });
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RecurringBillsComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); session = TestBed.inject(SessionService);
    session.accept(syntheticSession(), session.version());
    fixture = TestBed.createComponent(RecurringBillsComponent); c = fixture.componentInstance;
    fixture.detectChanges(); flushList(); flushUpcoming();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  function flushList(content = [bill]) {
    const req = http.expectOne(r => r.url === url && r.method === 'GET');
    req.flush({ content, page: Number(req.request.params.get('page')), size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0 });
    return req;
  }
  function flushUpcoming() {
    const req = http.expectOne(r => r.url === `${url}/upcoming`);
    req.flush([{ recurringBillId: 7, description: 'Internet', expectedAmount: null, dueDate: '2027-02-28' }]); return req;
  }
  function openEdit() { c.edit(7); http.expectOne(`${url}/7`).flush(bill); }
  function validCreate() { c.openCreate(); c.form.patchValue({ description: 'Renovação', firstDueDate: '2024-02-29', frequency: 'YEARLY' }); }

  it('shows one panel at a time and preserves filters when switching tabs', () => {
    fixture.detectChanges();
    const upcoming = fixture.nativeElement.querySelector('#recurring-upcoming-panel');
    const bills = fixture.nativeElement.querySelector('#recurring-bills-panel');
    expect(upcoming.hidden).toBe(false);
    expect(bills.hidden).toBe(true);
    const billsTab = fixture.nativeElement.querySelector('#recurring-bills-tab');
    billsTab.click(); fixture.detectChanges();
    expect(upcoming.hidden).toBe(true);
    expect(bills.hidden).toBe(false);
    c.changeFilter('paused'); flushList([{ ...bill, active: false }]);
    billsTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(upcoming.hidden).toBe(false);
    expect(billsTab.getAttribute('aria-selected')).toBe('false');
    fixture.nativeElement.querySelector('#recurring-bills-tab').click(); fixture.detectChanges();
    expect(c.filter()).toBe('paused');
    expect(fixture.nativeElement.querySelector('#active-filter').value).toBe('paused');
    http.expectNone(r => r.method === 'GET');
  });

  it('opens the header action in a modal and cancels without sending a write', () => {
    TestBed.inject(PageContextService).ctaCallback()!();
    fixture.detectChanges();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('#editor-title')?.textContent).toContain('Nova recorrência');
    dialog.querySelector<HTMLButtonElement>('.modal-close')!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    http.expectNone(r => r.method === 'POST' || r.method === 'PATCH');
  });

  it('opens a list item for editing and dismisses via backdrop or Escape', () => {
    c.activeTab.set('bills');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[aria-label="Editar Internet"]').click();
    http.expectOne(`${url}/7`).flush(bill);
    fixture.detectChanges();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector<HTMLInputElement>('#description')?.value).toBe('Internet');
    dialog.click();
    fixture.detectChanges();
    expect(c.editorOpen()).toBe(false);
    c.openCreate(); fixture.detectChanges();
    const cancel = new Event('cancel', { cancelable: true });
    fixture.nativeElement.querySelector('dialog').dispatchEvent(cancel);
    fixture.detectChanges();
    expect(cancel.defaultPrevented).toBe(true);
    expect(c.editorOpen()).toBe(false);
  });

  it('keeps the modal open while saving and shows server errors inside it', () => {
    validCreate(); c.save(); fixture.detectChanges();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dialog.click();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(c.editorOpen()).toBe(true);
    http.expectOne(url).flush({ errors: [{ field: 'description' }] }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Dados inválidos');
    expect(fixture.nativeElement.querySelector('.page [role="alert"]')).toBeNull();
  });

  it('renders official LocalDate projection and unknown amounts independently of the list filter', () => {
    c.changeMonth('2027-02'); expect(flushUpcoming().request.params.get('month')).toBe('2027-02');
    c.changeFilter('paused'); expect(flushList([{ ...bill, active: false }]).request.params.get('active')).toBe('false');
    fixture.detectChanges(); const text = fixture.nativeElement.textContent;
    expect(text).toContain('28/02/2027'); expect(text).toContain('não informado'); expect(text).toContain('Pausada');
    expect(c.dateLabel('2024-02-29')).toBe('29/02/2024');
  });
  it('sends defaults, nullable amount/notes and only editable fields; blocks a double submission', () => {
    validCreate(); c.save(); c.save();
    const req = http.expectOne(r => r.method === 'POST' && r.url === url);
    expect(req.request.body).toEqual({ description: 'Renovação', expectedAmount: null, frequency: 'YEARLY', firstDueDate: '2024-02-29', reminderDaysBefore: 3, emailEnabled: true, active: true, notes: null });
    req.flush({ ...bill, ...req.request.body }); flushList(); flushUpcoming();
    expect(c.editorOpen()).toBe(false);
  });
  it('reads latest detail before a complete PATCH for pause and email preference, clearing optional values', () => {
    openEdit(); c.form.patchValue({ active: false, emailEnabled: false, expectedAmount: '', notes: '' }); c.save();
    const req = http.expectOne(`${url}/7`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ description: bill.description, expectedAmount: null, frequency: bill.frequency, firstDueDate: bill.firstDueDate, reminderDaysBefore: 3, emailEnabled: false, active: false, notes: null, version: 0 });
    req.flush({ ...bill, ...req.request.body, version: 1 }); flushList(); flushUpcoming(); expect(c.editing()?.version).toBe(1);
  });
  it('requires explicit conflict reconciliation and a separate save with the fresh version', () => {
    openEdit(); c.form.patchValue({ description: 'Meu rascunho' }); c.save();
    http.expectOne(`${url}/7`).flush({ message: 'Recurring bill version conflict' }, { status: 409, statusText: 'Conflict' });
    expect(c.busy()).toBe(true);
    http.expectOne(`${url}/7`).flush({ ...bill, description: 'Outra edição', version: 2 }); flushList(); flushUpcoming();
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Outra edição');
    c.save(); http.expectNone(r => r.method === 'PATCH');
    expect(c.form.getRawValue().description).toBe('Meu rascunho'); c.keepDraft();
    http.expectNone(r => r.method === 'PATCH'); c.save();
    const req = http.expectOne(`${url}/7`); expect(req.request.body.version).toBe(2); expect(req.request.body.description).toBe('Meu rascunho');
    req.flush({ ...bill, version: 3 }); flushList(); flushUpcoming();
  });
  it('preserves frequency after the server locks it while allowing other draft changes', () => {
    openEdit(); c.form.patchValue({ frequency: 'YEARLY', description: 'Nova descrição' }); c.save();
    http.expectOne(`${url}/7`).flush({ message: 'Frequency cannot change after sending has started' }, { status: 409, statusText: 'Conflict' });
    http.expectOne(`${url}/7`).flush(bill); flushList(); flushUpcoming(); c.keepDraft();
    expect(c.form.getRawValue().frequency).toBe('MONTHLY'); expect(c.form.getRawValue().description).toBe('Nova descrição');
  });
  it('queries list after lost POST and blocks creation across navigation until explicit review', () => {
    validCreate(); c.save(); http.expectOne(url).error(new ProgressEvent('error'));
    expect(c.activeTab()).toBe('bills');
    c.openCreate(); c.save(); http.expectNone(r => r.method === 'POST');
    flushList(); flushUpcoming(); fixture.destroy();
    fixture = TestBed.createComponent(RecurringBillsComponent); c = fixture.componentInstance; fixture.detectChanges();
    flushList(); flushUpcoming(); expect(c.recovery()?.kind).toBe('create');
    c.confirmCreationReview(); validCreate(); expect(c.editorOpen()).toBe(true);
  });
  it('queries detail after lost PATCH and never automatically repeats it', () => {
    openEdit(); c.form.patchValue({ active: false }); c.save();
    http.expectOne(`${url}/7`).flush({}, { status: 500, statusText: 'Server Error' });
    http.expectOne(`${url}/7`).flush({ ...bill, active: false, version: 1 }); flushList(); flushUpcoming();
    c.save(); http.expectNone(r => r.method === 'PATCH'); c.useLatest();
    expect(c.editing()?.version).toBe(1); expect(c.form.getRawValue().active).toBe(false);
  });
  it.each(['create', 'update'])('requires consultation after navigating away during an in-flight %s', kind => {
    if (kind === 'create') validCreate(); else openEdit();
    c.save(); const write = http.expectOne(kind === 'create' ? url : `${url}/7`);
    fixture.destroy(); expect(write.cancelled).toBe(true);
    expect(TestBed.inject(RecurringBillService).recovery()?.kind).toBe(kind);
    fixture = TestBed.createComponent(RecurringBillsComponent); c = fixture.componentInstance; fixture.detectChanges();
    if (kind === 'update') http.expectOne(`${url}/7`).flush({ ...bill, version: 1 });
    flushList(); flushUpcoming(); c.save();
    http.expectNone(r => r.method === 'POST' || r.method === 'PATCH');
  });
  it('keeps writes blocked when a recovery detail consultation fails, then permits retrying the read', () => {
    openEdit(); c.save(); http.expectOne(`${url}/7`).error(new ProgressEvent('error'));
    http.expectOne(`${url}/7`).error(new ProgressEvent('error'));
    c.save(); http.expectNone(r => r.method === 'PATCH'); expect(c.latest()).toBeNull();
    c.checkRecovery(); http.expectOne(`${url}/7`).flush(bill); flushList(); flushUpcoming(); expect(c.latest()?.id).toBe(7);
  });
  it('refreshes unavailable records on 404 without retrying the write', () => {
    openEdit(); c.save(); http.expectOne(`${url}/7`).flush({ message: 'Recurring bill not found' }, { status: 404, statusText: 'Not Found' });
    flushList([]); flushUpcoming(); expect(c.editorOpen()).toBe(false); expect(c.error()).toContain('indisponível');
  });
  it('marks server validation fields without depending on localized messages', () => {
    validCreate(); c.save(); http.expectOne(url).flush({ errors: [{ field: 'description', message: 'Localized backend text' }] }, { status: 400, statusText: 'Bad Request' });
    expect(c.fieldError('description')).toContain('Confira'); http.expectNone(r => r.method === 'POST');
  });
  it('cancels outdated projections and rejects out-of-range month input', () => {
    c.changeMonth('2027-02'); const older = http.expectOne(r => r.url === `${url}/upcoming`);
    c.changeMonth('2027-03'); expect(older.cancelled).toBe(true); flushUpcoming();
    c.changeMonth('9999-01'); http.expectNone(`${url}/upcoming`); expect(c.upcomingError()).toContain('1900');
  });
  it('clears drafts, personal data and uncertain writes when the session ends', () => {
    openEdit(); c.save(); const pending = http.expectOne(`${url}/7`);
    session.invalidate('logout'); expect(pending.cancelled).toBe(true);
    expect(c.page()).toBeNull(); expect(c.occurrences()).toEqual([]); expect(c.editorOpen()).toBe(false);
    expect(c.form.getRawValue().description).toBe(''); expect(TestBed.inject(RecurringBillService).recovery()).toBeNull();
  });
});
