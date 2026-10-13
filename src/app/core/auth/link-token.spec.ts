/// <reference types="node" />
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { convertToParamMap } from '@angular/router';
import { LinkTokenService, parseLinkTokens } from './link-token.service';

describe('initial-document and SPA link protection', () => {
  const script = readFileSync('public/assets/auth-link.js', 'utf8');
  afterEach(() => { delete window.__UNITA_AUTH_LINK__; TestBed.resetTestingModule(); });
  it.each(['verify-email', 'reset-password'])('moves %s token into memory before Angular and replaces history', route => {
    const url = new URL(`https://unita.test/${route}?token=opaque%2B%2F%3D&source=email#secret`);
    const state = { navigationId: 2 }, replaceState = jest.fn();
    const browser = { location: url, history: { state, replaceState } };
    runInNewContext(script, { window: browser, URL });
    expect(replaceState).toHaveBeenCalledWith(state, '', `/${route}?source=email`);
    expect((browser as typeof browser & { __UNITA_AUTH_LINK__: unknown }).__UNITA_AUTH_LINK__).toEqual({ path: `/${route}`, tokens: ['opaque+/='], cleaned: true });
  });
  it('does not touch unrelated pages and closes consumption if history fails', () => {
    const replaceState = jest.fn(); runInNewContext(script, { window: { location: new URL('https://unita.test/dashboard?token=x'), history: { replaceState } }, URL });
    expect(replaceState).not.toHaveBeenCalled();
    const browser = { location: new URL('https://unita.test/reset-password?token=x'), history: { replaceState: () => { throw new Error(); } } };
    runInNewContext(script, { window: browser, URL });
    expect((browser as typeof browser & { __UNITA_AUTH_LINK__: { tokens: unknown[]; cleaned: boolean } }).__UNITA_AUTH_LINK__).toMatchObject({ tokens: [], cleaned: false });
  });
  it.each([[], [''], ['  '], ['a', 'b']].map(tokens => [tokens]))('rejects invalid token multiplicity/content %j', tokens => {
    expect(parseLinkTokens(tokens, true).token).toBeNull();
  });
  it('preserves an opaque token exactly and never consumes before scrubbing', () => {
    expect(parseLinkTokens([' a+/= '], true).token).toBe(' a+/= ');
    expect(parseLinkTokens(['opaque'], false).token).toBeNull();
  });
  it('consumes the initial memory handoff once and removes the window property', () => {
    window.__UNITA_AUTH_LINK__ = { path: '/reset-password', tokens: ['synthetic'], cleaned: true };
    TestBed.configureTestingModule({ imports: [RouterTestingModule] }); const links = TestBed.inject(LinkTokenService);
    expect(window.__UNITA_AUTH_LINK__).toBeUndefined();
    expect(links.take('/reset-password', convertToParamMap({})).token).toBe('synthetic');
    expect(links.take('/reset-password', convertToParamMap({})).token).toBeNull();
  });
  it('takes a newer SPA link over the stale initial token and strips every occurrence', () => {
    window.__UNITA_AUTH_LINK__ = { path: '/verify-email', tokens: ['old'], cleaned: true };
    TestBed.configureTestingModule({ imports: [RouterTestingModule] }); const location = TestBed.inject(Location);
    const replace = jest.spyOn(location, 'replaceState'); const links = TestBed.inject(LinkTokenService);
    expect(links.take('/verify-email', convertToParamMap({ token: 'new', source: 'email' })).token).toBe('new');
    expect(replace).toHaveBeenLastCalledWith('/verify-email', 'source=email');
    expect(links.take('/verify-email', convertToParamMap({ token: ['a', 'b'] })).token).toBeNull();
    expect(replace).toHaveBeenLastCalledWith('/verify-email', '');
  });
  it('the initial document establishes no-referrer before any link/env script', () => {
    const html = readFileSync('src/index.html', 'utf8');
    expect(html.indexOf('name="referrer" content="no-referrer"')).toBeLessThan(html.indexOf('src="assets/auth-link.js"'));
    expect(html.indexOf('src="assets/auth-link.js"')).toBeLessThan(html.indexOf('src="assets/env.js"'));
  });
});
