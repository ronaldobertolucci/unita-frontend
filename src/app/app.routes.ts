import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ── Rotas públicas (AuthLayout) ──────────────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout.component').then(
        m => m.AuthLayoutComponent
      ),
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then(
            m => m.LoginComponent
          ),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register.component').then(
            m => m.RegisterComponent
          ),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password.component').then(
            m => m.ForgotPasswordComponent
          ),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password.component').then(
            m => m.ResetPasswordComponent
          ),
      },
    ],
  },

  // ── Rotas privadas (MainLayout + authGuard) ───────────────────────
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/main-layout/main-layout.component').then(
        m => m.MainLayoutComponent
      ),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            m => m.DashboardComponent
          ),
        data: { title: 'Dashboard' },
      },
      {
        path: 'groups',
        loadComponent: () =>
          import('./features/groups/groups.component').then(
            m => m.GroupsComponent
          ),
        data: { title: 'Grupos' },
      },
      {
        path: 'groups/:id',
        loadComponent: () =>
          import('./features/groups/group-detail/group-detail.component').then(
            m => m.GroupDetailComponent
          ),
        data: { title: 'Grupo' },
      },
      {
        path: 'pockets',
        loadComponent: () =>
          import('./features/pockets/pockets.component').then(m => m.PocketsComponent),
        data: { title: 'Pockets' },
      },
      {
        path: 'pockets/:id',
        loadComponent: () =>
          import('./features/pockets/pocket-detail/pocket-detail.component')
            .then(m => m.PocketDetailComponent),
        data: { title: 'Transações' }
      },
      {
        path: 'transferencias',
        loadComponent: () =>
          import('./features/transfers/transfers.component').then(m => m.TransfersComponent),
        data: { title: 'Transferências' },
      },
      {
        path: 'cadastros',
        loadComponent: () =>
          import('./features/registries/registries.component').then(m => m.RegistriesComponent),
        children: [
          { path: '', redirectTo: 'empresas', pathMatch: 'full' },
          {
            path: 'empresas',
            loadComponent: () =>
              import('./features/registries/legal-entities/legal-entities.component').then(m => m.LegalEntitiesComponent),
            data: { title: 'Cadastros' },
          },
          {
            path: 'empregadores-pf',
            loadComponent: () =>
              import('./features/registries/individual-employers/individual-employers.component').then(m => m.IndividualEmployersComponent),
            data: { title: 'Cadastros' },
          },
          {
            path: 'empregadores-pj',
            loadComponent: () =>
              import('./features/registries/legal-entity-employers/legal-entity-employers.component').then(m => m.LegalEntityEmployersComponent),
            data: { title: 'Cadastros' },
          },
          {
            path: 'categorias',
            loadComponent: () =>
              import('./features/registries/categories/categories.component').then(m => m.CategoriesComponent),
            data: { title: 'Cadastros' },
          },
        ],
      },
    ],
  },

  // Fallback
  { path: '**', redirectTo: 'login' },
];