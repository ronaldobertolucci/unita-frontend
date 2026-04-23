import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { GroupService } from '../../../core/services/group.service';
import { InvitationService } from '../../../core/services/invitation.service';
import { translateApiError } from '../../../core/utils/api-error.util';
import { GroupDto, GroupMembership } from '../../../core/models/group.model';
import { GroupInvitation } from '../../../core/models/invitation.model';
import { GroupSharePermissionsComponent } from '../group-share-permissions/group-share-permissions.component';

type Tab = 'members' | 'invitations';
type ModalType =
  | 'edit-name'
  | 'invite'
  | 'transfer'
  | 'confirm-leave'
  | 'confirm-delete'
  | 'share-permissions'
  | null;

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, NgTemplateOutlet, GroupSharePermissionsComponent],
  templateUrl: './group-detail.component.html',
  styleUrl: './group-detail.component.css',
})
export class GroupDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly groupService = inject(GroupService);
  private readonly invitationService = inject(InvitationService);

  readonly group = signal<GroupDto | null>(null);
  readonly members = signal<GroupMembership[]>([]);
  readonly invitations = signal<GroupInvitation[]>([]);

  readonly isLoading = signal(true);
  readonly activeTab = signal<Tab>('members');
  readonly activeModal = signal<ModalType>(null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly currentUser = this.authService.currentUser;

  readonly isResponsible = computed(() => {
    const group = this.group();
    const user = this.currentUser();
    return !!group && !!user && group.responsibleUser.id === user.id;
  });

  readonly otherMembers = computed(() =>
    this.members().filter(m => m.user.id !== this.currentUser()?.id)
  );

  readonly selectedMemberId = signal<number | null>(null);

  readonly editNameForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  readonly inviteForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  get editNameControl() { return this.editNameForm.get('name')!; }
  get emailControl() { return this.inviteForm.get('email')!; }

  groupId!: number;

  ngOnInit(): void {
    this.groupId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadAll();
  }

  private loadAll(): void {
    this.isLoading.set(true);

    this.groupService.getGroup(this.groupId).subscribe({
      next: group => {
        this.group.set(group);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.router.navigate(['/groups']);
      },
    });

    this.groupService.getMembers(this.groupId).subscribe({
      next: members => this.members.set(members),
    });

    this.invitationService.getGroupInvitations(this.groupId).subscribe({
      next: invitations =>
        this.invitations.set(invitations.filter(i => i.status === 'PENDING')),
    });
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  openModal(type: ModalType): void {
    this.errorMessage.set(null);

    if (type === 'edit-name') {
      this.editNameForm.patchValue({ name: this.group()?.name ?? '' });
    }

    if (type === 'invite') {
      this.inviteForm.reset();
    }

    if (type === 'transfer') {
      this.selectedMemberId.set(null);
    }

    this.activeModal.set(type);
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.errorMessage.set(null);
  }

  saveGroupName(): void {
    if (this.editNameForm.invalid) {
      this.editNameForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.groupService
      .updateGroup(this.groupId, { name: this.editNameControl.value! })
      .subscribe({
        next: updated => {
          this.group.set(updated);
          this.isSaving.set(false);
          this.closeModal();
        },
        error: err => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err.error?.message));
        },
      });
  }

  inviteMember(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.invitationService
      .createInvitation(this.groupId, this.emailControl.value!)
      .subscribe({
        next: invitation => {
          this.invitations.update(list => [...list, invitation]);
          this.isSaving.set(false);
          this.closeModal();
        },
        error: err => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err.error?.message));
        },
      });
  }

  cancelInvitation(id: number): void {
    this.invitationService.cancelInvitation(id).subscribe({
      next: () =>
        this.invitations.update(list => list.filter(i => i.id !== id)),
    });
  }

  transferResponsibility(): void {
    const memberId = this.selectedMemberId();
    if (!memberId) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.groupService
      .transferResponsibility(this.groupId, { newResponsibleUserId: memberId })
      .subscribe({
        next: updated => {
          this.group.set(updated);
          this.isSaving.set(false);
          this.closeModal();
        },
        error: err => {
          this.isSaving.set(false);
          this.errorMessage.set(translateApiError(err.error?.message));
        },
      });
  }

  leaveGroup(): void {
    this.isSaving.set(true);
    this.groupService.leaveGroup(this.groupId).subscribe({
      next: () => this.router.navigate(['/groups']),
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err.error?.message));
      },
    });
  }

  deleteGroup(): void {
    this.isSaving.set(true);
    this.groupService.deleteGroup(this.groupId).subscribe({
      next: () => this.router.navigate(['/groups']),
      error: err => {
        this.isSaving.set(false);
        this.errorMessage.set(translateApiError(err.error?.message));
      },
    });
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }

  formatDate(isoString: string): string {
    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}