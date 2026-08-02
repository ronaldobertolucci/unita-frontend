import { TestBed } from '@angular/core/testing';
import { PageContextService } from './page-context.service';

describe('PageContextService', () => {
  let service: PageContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PageContextService);
  });

  // ── Criação ────────────────────────────────────────────────────────────────
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── Estado inicial ─────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('should expose pageSubtitle as null', () => {
      expect(service.pageSubtitle()).toBeNull();
    });

    it('should expose summaryDisplay as null', () => {
      expect(service.summaryDisplay()).toBeNull();
    });

    it('should expose ctaLabel as null', () => {
      expect(service.ctaLabel()).toBeNull();
    });

    it('should expose ctaCallback as null', () => {
      expect(service.ctaCallback()).toBeNull();
    });
  });

  // ── pageSubtitle ───────────────────────────────────────────────────────────
  describe('pageSubtitle', () => {
    it('should reflect the value after set', () => {
      service.pageSubtitle.set('Acompanhe seus ativos');
      expect(service.pageSubtitle()).toBe('Acompanhe seus ativos');
    });

    it('should reflect the last value when set multiple times', () => {
      service.pageSubtitle.set('First');
      service.pageSubtitle.set('Second');
      expect(service.pageSubtitle()).toBe('Second');
    });

    it('should accept null explicitly', () => {
      service.pageSubtitle.set('Some subtitle');
      service.pageSubtitle.set(null);
      expect(service.pageSubtitle()).toBeNull();
    });
  });

  // ── summaryDisplay ─────────────────────────────────────────────────────────
  describe('summaryDisplay', () => {
    it('should reflect the value after set', () => {
      service.summaryDisplay.set('R$ 112.888,02');
      expect(service.summaryDisplay()).toBe('R$ 112.888,02');
    });

    it('should reflect the last value when set multiple times', () => {
      service.summaryDisplay.set('R$ 1.000,00');
      service.summaryDisplay.set('R$ 2.500,00');
      expect(service.summaryDisplay()).toBe('R$ 2.500,00');
    });

    it('should accept null explicitly', () => {
      service.summaryDisplay.set('R$ 500,00');
      service.summaryDisplay.set(null);
      expect(service.summaryDisplay()).toBeNull();
    });
  });

  // ── ctaLabel ───────────────────────────────────────────────────────────────
  describe('ctaLabel', () => {
    it('should reflect the value after set', () => {
      service.ctaLabel.set('Novo ativo');
      expect(service.ctaLabel()).toBe('Novo ativo');
    });

    it('should reflect the last value when set multiple times', () => {
      service.ctaLabel.set('Primeiro');
      service.ctaLabel.set('Segundo');
      expect(service.ctaLabel()).toBe('Segundo');
    });
  });

  // ── ctaCallback ────────────────────────────────────────────────────────────
  describe('ctaCallback', () => {
    it('should store and invoke the callback', () => {
      const spy = jest.fn();
      service.ctaCallback.set(spy);

      service.ctaCallback()?.();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should invoke the callback without arguments', () => {
      const spy = jest.fn();
      service.ctaCallback.set(spy);

      service.ctaCallback()?.();

      expect(spy).toHaveBeenCalledWith();
    });

    it('should replace the previous callback', () => {
      const firstSpy  = jest.fn();
      const secondSpy = jest.fn();

      service.ctaCallback.set(firstSpy);
      service.ctaCallback.set(secondSpy);

      service.ctaCallback()?.();

      expect(firstSpy).not.toHaveBeenCalled();
      expect(secondSpy).toHaveBeenCalledTimes(1);
    });

    it('should not invoke the callback after it is set to null', () => {
      const spy = jest.fn();
      service.ctaCallback.set(spy);
      service.ctaCallback.set(null);

      service.ctaCallback()?.();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ── clear() ────────────────────────────────────────────────────────────────
  describe('clear()', () => {
    it('should reset pageSubtitle to null', () => {
      service.pageSubtitle.set('Some subtitle');
      service.clear();
      expect(service.pageSubtitle()).toBeNull();
    });

    it('should reset summaryDisplay to null', () => {
      service.summaryDisplay.set('R$ 1.000,00');
      service.clear();
      expect(service.summaryDisplay()).toBeNull();
    });

    it('should reset ctaLabel to null', () => {
      service.ctaLabel.set('Novo item');
      service.clear();
      expect(service.ctaLabel()).toBeNull();
    });

    it('should reset ctaCallback to null', () => {
      service.ctaCallback.set(() => {});
      service.clear();
      expect(service.ctaCallback()).toBeNull();
    });

    it('should reset all signals at once', () => {
      service.pageSubtitle.set('Subtitle');
      service.summaryDisplay.set('R$ 1.000,00');
      service.ctaLabel.set('Novo item');
      service.ctaCallback.set(() => {});

      service.clear();

      expect(service.pageSubtitle()).toBeNull();
      expect(service.summaryDisplay()).toBeNull();
      expect(service.ctaLabel()).toBeNull();
      expect(service.ctaCallback()).toBeNull();
    });

    it('should not throw when called on already-null signals', () => {
      expect(() => service.clear()).not.toThrow();
    });

    it('should be idempotent', () => {
      service.pageSubtitle.set('Subtitle');
      service.clear();
      service.clear();
      expect(service.pageSubtitle()).toBeNull();
    });

    it('should not affect a callback that was set after a previous clear', () => {
      service.ctaCallback.set(() => {});
      service.clear();

      const spy = jest.fn();
      service.ctaCallback.set(spy);

      service.ctaCallback()?.();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});