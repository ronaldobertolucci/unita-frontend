import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { LoginResponse } from '../models/auth.model';
import { environment } from '../../../environments/environment';

const mockUser = {
  id: 1,
  firstName: 'João',
  lastName: 'Silva',
  email: 'joao@email.com',
  dateOfBirth: '1990-01-01',
};

const mockLoginResponse: LoginResponse = {
  token: 'fake-jwt-token',
  user: mockUser,
};

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: jest.Mocked<Pick<Router, 'navigate'>>;

  beforeEach(() => {
    localStorage.clear();

    routerSpy = { navigate: jest.fn() };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should start with null token when localStorage is empty', () => {
      expect(service.token()).toBeNull();
    });

    it('should start with null user when localStorage is empty', () => {
      expect(service.currentUser()).toBeNull();
    });

    it('should start as unauthenticated', () => {
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should restore token from localStorage on init', () => {
      localStorage.setItem('unita_token', 'stored-token');
      localStorage.setItem('unita_user', JSON.stringify(mockUser));

      // Recria o serviço para simular reinicialização
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [AuthService, { provide: Router, useValue: routerSpy }],
      });

      const freshService = TestBed.inject(AuthService);
      expect(freshService.token()).toBe('stored-token');
      expect(freshService.isAuthenticated()).toBe(true);
    });
  });

  describe('login()', () => {
    it('should call POST /auth/login and save the session', () => {
      service.login({ email: 'joao@email.com', password: '12345678' }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      expect(req.request.method).toBe('POST');
      req.flush(mockLoginResponse);

      expect(service.token()).toBe('fake-jwt-token');
      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
      expect(localStorage.getItem('unita_token')).toBe('fake-jwt-token');
    });
  });

  describe('logout()', () => {
    it('should clear the session and navigate to /login', () => {
      // Simula sessão ativa
      localStorage.setItem('unita_token', 'fake-jwt-token');
      localStorage.setItem('unita_user', JSON.stringify(mockUser));

      service.logout();

      expect(service.token()).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(localStorage.getItem('unita_token')).toBeNull();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('register()', () => {
    it('should call POST /auth/register', () => {
      const payload = {
        firstName: 'João',
        lastName: 'Silva',
        email: 'joao@email.com',
        dateOfBirth: '1990-01-01',
        password: '12345678',
      };

      service.register(payload).subscribe(user => {
        expect(user).toEqual(mockUser);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush(mockUser);
    });
  });
});