import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SessionService } from './session.service';
import { PocketService } from './pocket.service';
import { AssetService } from './asset.service';
import { GroupService } from './group.service';
import { CreditCardService } from './credit-card.service';
import { CategoryService } from './category.service';
import { LegalEntityService } from './legal-entity.service';
import { EmployerService } from './employer.service';
import { TransactionService } from './transaction.service';
import { PageContextService } from './page-context.service';
import { NotificationService } from './notification.service';
import { COORDINATION_BROWSER } from './cookie-session-coordinator.service';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';
import { syntheticSession } from '../testing/session.mock';
import { investmentBaseline } from '../testing/investment-baseline.fixture';
import { DashboardService } from './dashboard.service';
import { Observable } from 'rxjs';

const pocket = { id: 1, type: 'BANK_ACCOUNT', label: 'Conta A', active: true, balance: 100 };
const asset = { id: 1, name: 'Investimento A', category: 'RENDA_FIXA', status: 'ACTIVE', legalEntityName: 'Empresa', custodianLegalEntityName: null, currentValue: 100, totalInvested: 100, redeemedValue: 0 };

describe('private stores bound to the session context', () => {
  let session: SessionService, http: HttpTestingController;
  beforeEach(() => {
    const harness = coordinationHarness();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      { provide: COORDINATION_BROWSER, useValue: harness.browser('A') }
    ] });
    session = TestBed.inject(SessionService); http = TestBed.inject(HttpTestingController);
    session.accept(syntheticSession(), session.version());
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('clears all root stores and callbacks synchronously on logout/account change', () => {
    const pockets = TestBed.inject(PocketService); pockets.loadPockets().subscribe(); http.expectOne('/api/pockets/my').flush([pocket]);
    const assets = TestBed.inject(AssetService); assets.loadAssets(); http.expectOne('/api/assets').flush([asset]);
    const groups = TestBed.inject(GroupService); groups.loadMyGroups(); http.expectOne('/api/groups/my').flush([{ id: 1, name: 'Grupo A', responsibleUser: syntheticSession().user }]);
    const cards = TestBed.inject(CreditCardService); cards.loadCreditCards().subscribe(); http.expectOne('/api/credit-cards/my').flush([{ id: 1, name: 'Cartão A' }]);
    const categories = TestBed.inject(CategoryService); categories.loadCategories().subscribe(); http.expectOne('/api/categories').flush([{ id: 1, name: 'Categoria A' }]);
    const legal = TestBed.inject(LegalEntityService); legal.loadLegalEntities().subscribe(); http.expectOne('/api/legal-entities').flush([{ id: 1, corporateName: 'Empresa A', tradeName: 'A' }]);
    const employers = TestBed.inject(EmployerService); employers.loadIndividualEmployers().subscribe(); http.expectOne('/api/employers/individual').flush([{ id: 1, name: 'Empregador A' }]);
    employers.loadLegalEntityEmployers().subscribe(); http.expectOne('/api/employers/legal-entity').flush([{ id: 1, legalEntity: { corporateName: 'Empresa A', tradeName: 'A' } }]);
    const transactions = TestBed.inject(TransactionService); transactions.loadTransactions(1).subscribe(); http.expectOne('/api/pockets/1/transactions').flush([{ id: 1 }]);
    const notifications = TestBed.inject(NotificationService); notifications.loadInvitations(); http.expectOne('/api/invitations/my/pending').flush([{ id: 1 }]);
    const page = TestBed.inject(PageContextService); page.pageSubtitle.set('Dados A'); page.summaryDisplay.set('R$ 100'); page.ctaCallback.set(() => {});
    expect(pockets.pockets()).toHaveLength(1); expect(assets.assets()).toHaveLength(1); expect(groups.myGroups()).toHaveLength(1);
    session.invalidate('logout');
    for (const values of [pockets.pockets(), assets.assets(), groups.myGroups(), cards.creditCards(), categories.categories(), legal.legalEntities(), employers.individualEmployers(), employers.legalEntityEmployers(), transactions.transactions(), notifications.invitations()]) expect(values).toEqual([]);
    expect(page.pageSubtitle()).toBeNull(); expect(page.summaryDisplay()).toBeNull(); expect(page.ctaCallback()).toBeNull();
    expect(notifications.sseToast()).toBeNull(); expect(notifications.pendingCount()).toBe(0);
    expect(assets.isLoading()).toBe(false); expect(groups.loading()).toBe(false);
  });

  it('cancels an old financial load and failure in B does not reveal cache from A', () => {
    const assets = TestBed.inject(AssetService); assets.loadAssets(); http.expectOne('/api/assets').flush([asset]);
    assets.loadAssets(); const old = http.expectOne('/api/assets');
    session.invalidate('login', 'unknown'); session.accept(syntheticSession(2), session.version());
    expect(old.cancelled).toBe(true); expect(assets.assets()).toEqual([]); expect(assets.isLoading()).toBe(false);
    assets.loadAssets(); http.expectOne('/api/assets').flush({}, { status: 500, statusText: 'Error' });
    expect(assets.assets()).toEqual([]);
  });

  it('cancels an old write without running follow-up loads or updating the new account', () => {
    const pockets = TestBed.inject(PocketService);
    pockets.createBankAccount({ legalEntityId: 1, number: '123', agency: '001', bankAccountTypeId: 1 }).subscribe();
    const old = http.expectOne('/api/pockets/bank-accounts');
    session.invalidate('login', 'unknown'); session.accept(syntheticSession(2), session.version());
    expect(old.cancelled).toBe(true); http.expectNone('/api/pockets/my'); expect(pockets.pockets()).toEqual([]);
  });

  const investmentRequests: [string, (service: AssetService) => Observable<unknown>][] = [
    ['fixed-income creation', service => service.createFixedIncome(investmentBaseline().fixedIncomeCreate)],
    ['pension creation', service => service.createPension(investmentBaseline().pensionCreate)],
    ['metadata update', service => service.updateAsset(93002, { name: 'A private name', custodianLegalEntityId: null })],
    ['position update', service => service.updatePosition(93002, { currentValue: 550.87654321, lastValuationDate: '2025-12-31' })],
    ['deletion', service => service.deleteAsset(93002)],
    ['buy', service => service.buy(93002, investmentBaseline().buy)],
    ['yield', service => service.recordYield(93002, investmentBaseline().yieldPayload)],
    ['sell', service => service.sell(93001, investmentBaseline().sell)],
    ['detail', service => service.getAsset(93002)],
    ['history', service => service.getTransactions(93002)],
  ];

  it.each(investmentRequests)('cancels investment %s on account change without delivering stale data', (_name, request) => {
    const assets = TestBed.inject(AssetService);
    assets.loadAssets(); http.expectOne('/api/assets').flush(investmentBaseline().summaries);
    const received = jest.fn(), completed = jest.fn();
    request(assets).subscribe({ next: received, complete: completed });
    const pending = http.expectOne(request => request.url.startsWith('/api/assets/'));
    session.invalidate('login', 'unknown');
    session.accept(syntheticSession(2), session.version());
    expect(pending.cancelled).toBe(true);
    expect(received).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(assets.assets()).toEqual([]);
    expect(assets.isLoading()).toBe(false);
    http.expectNone(request => true);
  });

  it.each(investmentRequests)('never starts investment %s captured in a previous session', (_name, request) => {
    const assets = TestBed.inject(AssetService);
    const oldOperation = request(assets);
    session.invalidate('login', 'unknown');
    session.accept(syntheticSession(2), session.version());
    const received = jest.fn();
    oldOperation.subscribe(received);
    expect(received).not.toHaveBeenCalled();
    expect(assets.assets()).toEqual([]);
    http.expectNone(request => true);
  });

  it('cancels personal and group investment profit reads on session change', () => {
    const dashboard = TestBed.inject(DashboardService);
    const received = jest.fn();
    dashboard.getNetProfit().subscribe(received);
    dashboard.getGroupNetProfit(8).subscribe(received);
    const personal = http.expectOne('/api/dashboard/net-profit');
    const group = http.expectOne('/api/groups/8/dashboard/net-profit');
    session.invalidate('logout');
    expect(personal.cancelled).toBe(true);
    expect(group.cancelled).toBe(true);
    expect(received).not.toHaveBeenCalled();
  });

  it('closes stream and ignores queued events from the old connection', async () => {
    const original = globalThis.EventSource;
    let listener: ((event: MessageEvent) => void) | undefined;
    const close = jest.fn();
    globalThis.EventSource = class {
      onerror = null;
      addEventListener(_name: string, callback: (event: MessageEvent) => void) { listener = callback; }
      close = close;
    } as unknown as typeof EventSource;
    try {
      const notifications = TestBed.inject(NotificationService); notifications.connectSSE(); await flushCoordination();
      session.invalidate('logout'); expect(close).toHaveBeenCalledTimes(1);
      listener!({ data: JSON.stringify({ invitationId: 1, groupName: 'Old', invitingUserFirstName: 'Nome', invitingUserLastName: 'Sobrenome' }) } as MessageEvent);
      expect(notifications.sseToast()).toBeNull(); http.expectNone('/api/invitations/my/pending');
    } finally { globalThis.EventSource = original; }
  });
});
