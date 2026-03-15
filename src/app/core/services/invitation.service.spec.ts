import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { InvitationService } from './invitation.service';
import { environment } from '../../../environments/environment';

describe('InvitationService', () => {
  let service: InvitationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [InvitationService],
    });
    service = TestBed.inject(InvitationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getGroupInvitations()', () => {
    it('should call GET /invitations/group/:groupId', () => {
      service.getGroupInvitations(10).subscribe();
      const req = httpMock.expectOne(`${environment.apiUrl}/invitations/group/10`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  describe('createInvitation()', () => {
    it('should call POST /invitations with correct body', () => {
      service.createInvitation(10, 'novo@email.com').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/invitations`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        groupId: 10,
        invitedUserEmail: 'novo@email.com',
      });
      req.flush({});
    });
  });

  describe('cancelInvitation()', () => {
    it('should call DELETE /invitations/:id', () => {
      service.cancelInvitation(5).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/invitations/5`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});