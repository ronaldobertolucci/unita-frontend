import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { PageContextService } from '../../core/services/page-context.service';

@Component({
  selector: 'app-registries',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './registries.component.html',
  styleUrl: './registries.component.css',
})
export class RegistriesComponent implements OnDestroy, OnInit {
  private pageContextService = inject(PageContextService);

  ngOnInit(): void {
    this.pageContextService.pageSubtitle.set('Gerencie empresas e empregadores utilizados nos seus pockets');
  }

  ngOnDestroy(): void {
    this.pageContextService.clear();
  }
}