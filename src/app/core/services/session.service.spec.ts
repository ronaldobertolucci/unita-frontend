import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { SessionService } from './session.service';
import { AuthContractError } from '../auth/auth-contract';

import { syntheticSession } from '../testing/session.mock';

describe('session context in memory', () => {
  let session: SessionService;
  beforeEach(() => { session = TestBed.inject(SessionService); });
  afterEach(() => { TestBed.resetTestingModule(); jest.useRealTimers(); });
  it('starts unknown and closed; only a valid DTO accepts access', () => {
    expect(session.state()).toBe('unknown'); expect(session.getToken()).toBeNull();
    expect(() => session.accept({}, session.version())).toThrow(AuthContractError);
    expect(session.accept(syntheticSession(), session.version())).toBe(true);
    expect(session.user()?.id).toBe(1); expect(session.getToken()).toBe('synthetic-1');
  });
  it('clears all registered data synchronously and rejects a late session response', () => {
    const cleanup = jest.fn(); session.registerCleanup(cleanup, TestBed.inject(DestroyRef));
    const version = session.version(); session.accept(syntheticSession(), version);
    session.invalidate('logout');
    expect(cleanup).toHaveBeenCalledTimes(1); expect(session.user()).toBeNull(); expect(session.getToken()).toBeNull();
    expect(session.accept(syntheticSession(), version)).toBe(false);
    expect(session.state()).toBe('anonymous');
  });
  it('cancels in-flight data and drops obsolete emissions without exposing account A to B', () => {
    const pending = new Subject<number>(); const next = jest.fn(), complete = jest.fn();
    session.accept(syntheticSession(), session.version());
    session.scoped(() => pending).subscribe({ next, complete });
    session.invalidate('login', 'unknown'); session.accept(syntheticSession(2), session.version());
    pending.next(1); pending.complete();
    expect(next).not.toHaveBeenCalled(); expect(complete).toHaveBeenCalledTimes(1);
    expect(session.user()?.id).toBe(2);
  });
  it('does not dispatch an observable created under a previous context', () => {
    const request = jest.fn(() => new Observable()); const obsolete = session.scoped(request);
    session.invalidate('login', 'unknown'); obsolete.subscribe();
    expect(request).not.toHaveBeenCalled();
  });
  it('closes locally at expiry without polling or a request', () => {
    jest.useFakeTimers(); const cleanup = jest.fn(); session.registerCleanup(cleanup, TestBed.inject(DestroyRef));
    session.accept({ ...syntheticSession(), expiresIn: 2 }, session.version());
    jest.advanceTimersByTime(2001);
    expect(session.state()).toBe('anonymous'); expect(session.isAuthenticated()).toBe(false);
    expect(session.renewalOwner()).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('keeps only the renewal owner after expiry and forgets it on logout/account change', () => {
    session.accept(syntheticSession(), session.version()); session.invalidate('expired');
    expect(session.user()).toBeNull(); expect(session.token()).toBeNull(); expect(session.renewalOwner()).toBe(1);
    session.invalidate('logout'); expect(session.renewalOwner()).toBeNull();
    session.accept(syntheticSession(2), session.version()); session.invalidate('expired');
    session.invalidate('login', 'unknown'); expect(session.renewalOwner()).toBeNull();
  });
  it('blocked contexts cannot be reopened by the old response', () => {
    const version = session.version(); session.invalidate('blocked');
    expect(session.accept(syntheticSession(), version)).toBe(false);
    expect(session.accept(syntheticSession(), session.version())).toBe(false);
    expect(session.state()).toBe('blocked');
  });
});
