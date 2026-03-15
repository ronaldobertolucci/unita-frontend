import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GroupService } from '../../core/services/group.service';
import { GroupDto } from '../../core/models/group.model';

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './groups.component.html',
  styleUrl: './groups.component.css',
})
export class GroupsComponent implements OnInit {
  private readonly groupService = inject(GroupService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly groups = this.groupService.myGroups;
  readonly isLoading = this.groupService.loading;

  readonly modalOpen = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly createForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  get nameControl() {
    return this.createForm.get('name')!;
  }

  ngOnInit(): void {
    this.groupService.loadMyGroups();
  }

  openModal(): void {
    this.createForm.reset();
    this.errorMessage.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  onCreateGroup(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.groupService
      .createGroup({ name: this.nameControl.value! })
      .subscribe({
        next: (group: GroupDto) => {
          this.isSaving.set(false);
          this.closeModal();
          this.router.navigate(['/groups', group.id]);
        },
        error: err => {
          this.isSaving.set(false);
          this.errorMessage.set(
            err.error?.message ?? 'Ocorreu um erro. Tente novamente.'
          );
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
}