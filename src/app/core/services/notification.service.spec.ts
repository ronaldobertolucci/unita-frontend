import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { NotificationService } from './notification.service';
import { GroupInvitation } from '../models/invitation.model';
import { environment } from '../../../environments/environment';

const mockUser = {
  id: 2,
  firstName: 'Maria',
  lastName: 'Santos',
  email: 'maria@email.com',
  dateOfBirth: '1992-05-10',
};

const mockInvitations: GroupInvitation[] = [
  {
    id: 1,
    group: { id: 10, name: 'Família', responsibleUser: mockUser },
    invitedUser: mockUser,
    status: 'PENDING',
  },
  {
    id: 2,
    group: { id: 11, name: 'Trabalho', responsibleUser: mockUser },
    invitedUser: mockUser,
    status: 'PENDING',
  },
];

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [NotificationService],
    });

    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should start with empty invitations', () => {
      expect(service.invitations()).toEqual([]);
    });

    it('should start with pendingCount = 0', () => {
      expect(service.pendingCount()).toBe(0);
    });

    it('should start with hasNotifications = false', () => {
      expect(service.hasNotifications()).toBe(false);
    });

    it('should start with loading = false', () => {
      expect(service.loading()).toBe(false);
    });
  });

  describe('loadInvitations()', () => {
    it('should call GET /invitations/my/pending', () => {
      service.loadInvitations();

      const req = httpMock.expectOne(`${environment.apiUrl}/invitations/my/pending`);
      expect(req.request.method).toBe('GET');
      req.flush(mockInvitations);
    });

    it('should populate invitations signal on success', () => {
      service.loadInvitations();

      httpMock
        .expectOne(`${environment.apiUrl}/invitations/my/pending`)
        .flush(mockInvitations);

      expect(service.invitations()).toEqual(mockInvitations);
      expect(service.pendingCount()).toBe(2);
      expect(service.hasNotifications()).toBe(true);
    });

    it('should set loading to true during request and false after', () => {
      service.loadInvitations();
      expect(service.loading()).toBe(true);

      httpMock
        .expectOne(`${environment.apiUrl}/invitations/my/pending`)
        .flush(mockInvitations);

      expect(service.loading()).toBe(false);
    });

    it('should set loading to false on error', () => {
      service.loadInvitations();
      expect(service.loading()).toBe(true);

      httpMock
        .expectOne(`${environment.apiUrl}/invitations/my/pending`)
        .flush({ message: 'Erro' }, { status: 500, statusText: 'Server Error' });

      expect(service.loading()).toBe(false);
    });
  });

  describe('respondToInvitation()', () => {
    beforeEach(() => {
      service.loadInvitations();
      httpMock
        .expectOne(`${environment.apiUrl}/invitations/my/pending`)
        .flush(mockInvitations);
    });

    it('should call PUT /invitations/{id}/respond with accept=true', () => {
      service.respondToInvitation(1, true);

      const req = httpMock.expectOne(`${environment.apiUrl}/invitations/1/respond`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ accept: true });
      req.flush({ ...mockInvitations[0], status: 'ACCEPTED' });
    });

    it('should call PUT /invitations/{id}/respond with accept=false', () => {
      service.respondToInvitation(1, false);

      const req = httpMock.expectOne(`${environment.apiUrl}/invitations/1/respond`);
      expect(req.request.body).toEqual({ accept: false });
      req.flush({ ...mockInvitations[0], status: 'REJECTED' });
    });

    it('should remove the invitation from the list after responding', () => {
      expect(service.invitations().length).toBe(2);

      service.respondToInvitation(1, true);
      httpMock
        .expectOne(`${environment.apiUrl}/invitations/1/respond`)
        .flush({ ...mockInvitations[0], status: 'ACCEPTED' });

      expect(service.invitations().length).toBe(1);
      expect(service.invitations().find(i => i.id === 1)).toBeUndefined();
    });

    it('should update pendingCount after responding', () => {
      expect(service.pendingCount()).toBe(2);

      service.respondToInvitation(1, false);
      httpMock
        .expectOne(`${environment.apiUrl}/invitations/1/respond`)
        .flush({ ...mockInvitations[0], status: 'REJECTED' });

      expect(service.pendingCount()).toBe(1);
    });

    it('should set hasNotifications to false when last invitation is responded', () => {
      service.respondToInvitation(1, true);
      httpMock.expectOne(`${environment.apiUrl}/invitations/1/respond`).flush({});

      service.respondToInvitation(2, true);
      httpMock.expectOne(`${environment.apiUrl}/invitations/2/respond`).flush({});

      expect(service.hasNotifications()).toBe(false);
    });
  });
});