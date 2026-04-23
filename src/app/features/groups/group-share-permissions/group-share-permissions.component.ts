import { Component, inject, signal, input, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GroupService, SharePermissionDto, ShareType } from '../../../core/services/group.service';
import { translateApiError } from '../../../core/utils/api-error.util';

interface PermissionRow {
  shareType: ShareType;
  label: string;
  description: string;
  enabled: boolean;
}

@Component({
  selector: 'app-group-share-permissions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './group-share-permissions.component.html',
  styleUrl: './group-share-permissions.component.css',
})
export class GroupSharePermissionsComponent implements OnInit {
  private readonly groupService = inject(GroupService);

  readonly groupId = input.required<number>();
  readonly closed  = output<void>();

  readonly isLoading = signal(false);
  readonly isSaving  = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly permissions = signal<PermissionRow[]>([]);

  private readonly labelMap: Record<ShareType, { label: string; description: string }> = {
    BALANCE: {
      label: 'Saldo dos pockets',
      description: 'Compartilha o saldo de cada conta e carteira com os membros do grupo.',
    },
    CREDIT_CARD_BILLS: {
      label: 'Faturas de cartão',
      description: 'Compartilha suas faturas de cartão de crédito com os membros do grupo.',
    },
    INVESTMENTS: {
      label: 'Investimentos',
      description: 'Compartilha seus investimentos e ativos com os membros do grupo.',
    },
    EXPENSES_BY_CATEGORY: {
      label: 'Despesas por categoria',
      description: 'Compartilha o total de despesas agrupadas por categoria.',
    },
    INCOME_BY_CATEGORY: {
      label: 'Receitas por categoria',
      description: 'Compartilha o total de receitas agrupadas por categoria.',
    },
  };

  // Ordem de exibição fixa
  private readonly displayOrder: ShareType[] = [
    'BALANCE',
    'CREDIT_CARD_BILLS',
    'INVESTMENTS',
    'EXPENSES_BY_CATEGORY',
    'INCOME_BY_CATEGORY',
  ];

  ngOnInit(): void {
    this.isLoading.set(true);
    this.groupService.getSharePermissions(this.groupId()).subscribe({
      next: data => {
        const loaded = new Map(data.map(p => [p.shareType, p.enabled]));
        this.permissions.set(
          this.displayOrder.map(shareType => ({
            shareType,
            label: this.labelMap[shareType].label,
            description: this.labelMap[shareType].description,
            enabled: loaded.get(shareType) ?? false,
          }))
        );
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(translateApiError(err?.error?.message));
        this.isLoading.set(false);
      },
    });
  }

  toggle(shareType: ShareType): void {
    this.permissions.update(rows =>
      rows.map(r => r.shareType === shareType ? { ...r, enabled: !r.enabled } : r)
    );
  }

  save(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.groupService.updateSharePermissions(this.groupId(), {
      permissions: this.permissions().map(r => ({
        shareType: r.shareType,
        enabled: r.enabled,
      })),
    }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closed.emit();
      },
      error: err => {
        this.errorMessage.set(translateApiError(err?.error?.message));
        this.isSaving.set(false);
      },
    });
  }

  close(): void {
    this.closed.emit();
  }
}