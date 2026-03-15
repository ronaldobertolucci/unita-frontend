import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="placeholder">
      <div class="placeholder-icon">📊</div>
      <h2>Dashboard</h2>
      <p>Em breve</p>
    </div>
  `,
  styles: [`
    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 60vh;
      gap: 0.75rem;
      color: var(--text-muted);
      text-align: center;
    }

    .placeholder-icon {
      font-size: 2.5rem;
      margin-bottom: 0.25rem;
      opacity: 0.5;
    }

    h2 {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-secondary);
    }

    p {
      font-size: 0.875rem;
    }
  `],
})
export class DashboardComponent {}