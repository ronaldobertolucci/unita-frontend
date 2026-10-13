import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy, inject } from '@angular/core';

/** Focus follows a submit or a changed page/result, never each keystroke. */
@Directive({ selector: '[authAccessibility]', standalone: true, host: { '(submit)': 'submitted()' } })
export class AuthAccessibilityDirective implements AfterViewInit, OnDestroy {
  private readonly element: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private title = '';
  private feedback = '';
  private destroyed = false;

  ngAfterViewInit(): void {
    this.title = this.element.querySelector('h1, h2')?.textContent?.trim() ?? '';
    this.feedback = this.element.querySelector('#auth-feedback')?.textContent?.trim() ?? '';
    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver(() => this.changed());
      this.observer.observe(this.element, { subtree: true, childList: true, characterData: true });
      this.schedule(() => {
        if (!this.element.contains(this.element.ownerDocument.activeElement)) this.changed(true);
      });
    });
  }
  submitted(): void {
    this.schedule(() => this.element.querySelector<HTMLElement>('input[aria-invalid="true"]')?.focus());
  }
  private changed(initial = false): void {
    if (this.destroyed) return;
    const heading = this.element.querySelector<HTMLElement>('h1, h2');
    const feedback = this.element.querySelector<HTMLElement>('#auth-feedback');
    const title = heading?.textContent?.trim() ?? '', message = feedback?.textContent?.trim() ?? '';
    if (title && (initial || title !== this.title)) heading?.focus();
    else if (message && message !== this.feedback) {
      (this.element.querySelector<HTMLElement>('input[aria-invalid="true"]') ?? feedback)?.focus();
    }
    this.title = title; this.feedback = message;
  }
  private schedule(callback: () => void): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.zone.runOutsideAngular(() => {
      this.timer = setTimeout(() => { this.timer = null; if (!this.destroyed) callback(); }, 0);
    });
  }
  ngOnDestroy(): void {
    this.destroyed = true; this.observer?.disconnect();
    if (this.timer !== null) clearTimeout(this.timer); this.timer = null;
  }
}
