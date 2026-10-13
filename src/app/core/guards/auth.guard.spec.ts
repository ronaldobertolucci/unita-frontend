import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

function runGuard(): Promise<boolean | UrlTree> {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
  ) as Promise<boolean | UrlTree>;
}

describe('authGuard', () => {
  let router: Router;

  function setup(authenticated: boolean) {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: { ensureAuthenticated: jest.fn().mockResolvedValue(authenticated) },
        },
      ],
    });

    router = TestBed.inject(Router);
  }

  it('should return true when user is authenticated', async () => {
    setup(true);
    expect(await runGuard()).toBe(true);
  });

  it('should return a UrlTree to /login when user is NOT authenticated', async () => {
    setup(false);
    const result = await runGuard();
    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });
});