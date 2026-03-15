import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { GroupService } from './group.service';
import { GroupDto } from '../models/group.model';
import { environment } from '../../../environments/environment';

const mockUser = {
  id: 1,
  firstName: 'João',
  lastName: 'Silva',
  email: 'joao@email.com',
  dateOfBirth: '1990-01-01',
};

const mockGroup: GroupDto = {
  id: 10,
  name: 'Família',
  responsibleUser: mockUser,
};

const mockGroup2: GroupDto = {
  id: 11,
  name: 'Trabalho',
  responsibleUser: mockUser,
};

describe('GroupService', () => {
  let service: GroupService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [GroupService],
    });
    service = TestBed.inject(GroupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should start with empty myGroups', () => {
      expect(service.myGroups()).toEqual([]);
    });

    it('should start with loading = false', () => {
      expect(service.loading()).toBe(false);
    });
  });

  describe('loadMyGroups()', () => {
    it('should call GET /groups/my', () => {
      service.loadMyGroups();
      const req = httpMock.expectOne(`${environment.apiUrl}/groups/my`);
      expect(req.request.method).toBe('GET');
      req.flush([mockGroup]);
    });

    it('should populate myGroups signal on success', () => {
      service.loadMyGroups();
      httpMock.expectOne(`${environment.apiUrl}/groups/my`).flush([mockGroup, mockGroup2]);
      expect(service.myGroups()).toEqual([mockGroup, mockGroup2]);
    });

    it('should manage loading state correctly', () => {
      service.loadMyGroups();
      expect(service.loading()).toBe(true);
      httpMock.expectOne(`${environment.apiUrl}/groups/my`).flush([]);
      expect(service.loading()).toBe(false);
    });

    it('should set loading to false on error', () => {
      service.loadMyGroups();
      httpMock
        .expectOne(`${environment.apiUrl}/groups/my`)
        .flush({}, { status: 500, statusText: 'Server Error' });
      expect(service.loading()).toBe(false);
    });
  });

  describe('createGroup()', () => {
    it('should call POST /groups and add group to myGroups signal', () => {
      service.createGroup({ name: 'Família' }).subscribe(result => {
        expect(result).toEqual(mockGroup);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/groups`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Família' });
      req.flush(mockGroup);

      expect(service.myGroups()).toContain(mockGroup);
    });
  });

  describe('updateGroup()', () => {
    it('should call PUT /groups/:id and update signal', () => {
      service['_myGroups'].set([mockGroup]);
      const updated = { ...mockGroup, name: 'Família Atualizada' };

      service.updateGroup(10, { name: 'Família Atualizada' }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/groups/10`);
      expect(req.request.method).toBe('PUT');
      req.flush(updated);

      expect(service.myGroups()[0].name).toBe('Família Atualizada');
    });
  });

  describe('deleteGroup()', () => {
    it('should call DELETE /groups/:id and remove from signal', () => {
      service['_myGroups'].set([mockGroup, mockGroup2]);

      service.deleteGroup(10).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/groups/10`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(service.myGroups().find(g => g.id === 10)).toBeUndefined();
      expect(service.myGroups().length).toBe(1);
    });
  });

  describe('leaveGroup()', () => {
    it('should call DELETE /groups/:id/leave and remove from signal', () => {
      service['_myGroups'].set([mockGroup, mockGroup2]);

      service.leaveGroup(10).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/groups/10/leave`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(service.myGroups().find(g => g.id === 10)).toBeUndefined();
    });
  });

  describe('transferResponsibility()', () => {
    it('should call PUT /groups/:id/transfer with correct body', () => {
      service.transferResponsibility(10, { newResponsibleUserId: 2 }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/groups/10/transfer`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ newResponsibleUserId: 2 });
      req.flush({ ...mockGroup, responsibleUser: { ...mockUser, id: 2 } });
    });
  });

  describe('getMembers()', () => {
    it('should call GET /groups/:id/members', () => {
      service.getMembers(10).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/groups/10/members`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });
});