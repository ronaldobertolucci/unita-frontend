import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  HostListener,
  ElementRef,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { NgTemplateOutlet } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

export interface NavItem {
  label: string;
  path: string;
  icons: string[]; // array de paths SVG
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icons: [
      'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    ],
  },
  {
    label: 'Grupos',
    path: '/groups',
    icons: [
      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
      'M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
      'M23 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75',
    ],
  },
  {
    label: 'Pockets',
    path: '/pockets',
    icons: [
      'M21 12V7H5a2 2 0 0 1 0-4h14v4',
      'M3 5v14a2 2 0 0 0 2 2h16v-5',
      'M18 12a2 2 0 0 0 0 4h4v-4z',
    ],
  },
  {
    label: 'Cadastros',
    path: '/cadastros',
    icons: [
      'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      'M9 22V12h6v10',
    ],
  },
];

type NotificationSource = 'sidebar' | 'topbar' | 'mobile' | null;
type UserMenuSource = 'sidebar' | 'topbar' | null;

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
})
export class MainLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly navItems = NAV_ITEMS;

  readonly currentUser = this.authService.currentUser;
  readonly userInitials = computed(() => {
    const user = this.currentUser();
    if (!user) return '?';
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  });

  readonly invitations = this.notificationService.invitations;
  readonly pendingCount = this.notificationService.pendingCount;
  readonly notificationsLoading = this.notificationService.loading;
  readonly respondError = this.notificationService.respondError;

  readonly notificationSource = signal<NotificationSource>(null);
  readonly userMenuSource = signal<UserMenuSource>(null);

  readonly pageTitle = signal('Dashboard');

  ngOnInit(): void {
    this.notificationService.loadInvitations();
    this.syncPageTitle();
  }

  private syncPageTitle(): void {
    this.updateTitleFromUrl(this.router.url);
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        map(e => (e as NavigationEnd).urlAfterRedirects)
      )
      .subscribe(url => this.updateTitleFromUrl(url));
  }

  private updateTitleFromUrl(url: string): void {
    const route = this.router.routerState.root;
    let current = route;
    while (current.firstChild) current = current.firstChild;
    const title = current.snapshot.data?.['title'];
    if (title) this.pageTitle.set(title);
  }

  toggleNotifications(source: 'sidebar' | 'topbar' | 'mobile'): void {
    this.notificationSource.update(v => (v === source ? null : source));
    this.userMenuSource.set(null);
  }

  toggleUserMenu(source: 'sidebar' | 'topbar'): void {
    this.userMenuSource.update(v => (v === source ? null : source));
    this.notificationSource.set(null);
  }

  respondToInvitation(id: number, accept: boolean): void {
    this.notificationService.respondToInvitation(id, accept);
  }

  logout(): void {
    this.authService.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) return;

    const clickedNotifBtn = target.closest('[data-notif-btn]');
    const clickedNotifPanel = target.closest('[data-notif-panel]');
    const clickedUserBtn = target.closest('[data-user-btn]');
    const clickedUserMenu = target.closest('[data-user-menu]');

    if (!clickedNotifBtn && !clickedNotifPanel) {
      this.notificationSource.set(null);
    }
    if (!clickedUserBtn && !clickedUserMenu) {
      this.userMenuSource.set(null);
    }
  }
}