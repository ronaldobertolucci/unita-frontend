export type AuthRequestKind = 'session' | 'public' | 'protected' | 'other';

export const AUTH_SESSION_OPTIONS = Object.freeze({
  withCredentials: true,
  headers: Object.freeze({ 'X-CSRF-Protection': '1' })
});

type Route = readonly [readonly string[], string];
const SESSION_ROUTES: readonly Route[] = [
  [['POST'], '/auth/login'], [['POST'], '/auth/refresh'], [['POST'], '/auth/logout']
];
const PUBLIC_ROUTES: readonly Route[] = [
  [['POST'], '/auth/register'], [['GET'], '/auth/verify-email'],
  [['POST'], '/auth/resend-verification'], [['POST'], '/password/forgot'],
  [['GET'], '/password/reset/validate'], [['POST'], '/password/reset']
];

// Methods and paths checked against the local Unita controllers (H02).
// Unknown routes require contract review before they can receive credentials.
export const AUTH_PROTECTED_ROUTES: readonly Route[] = [
  [['GET'], '/auth/me'],
  [['GET'], '/dashboard'],
  [['GET'], '/dashboard/{summary}'],
  [['GET'], '/groups/{id}/dashboard'],
  [['GET'], '/groups/{id}/dashboard/{summary}'],
  [['GET'], '/pockets/my'],
  [['POST'], '/pockets/{pocketType}'],
  [['GET', 'PUT', 'DELETE'], '/pockets/{pocketType}/{id}'],
  [['GET', 'POST'], '/pockets/cash'],
  [['GET', 'POST'], '/pockets/{id}/transactions'],
  [['GET'], '/pockets/{id}/balance'],
  [['DELETE'], '/pockets/{id}/transactions/{id}'],
  [['POST'], '/transfers'], [['POST'], '/transfers/fgts/withdrawal'],
  [['POST'], '/credit-cards'], [['GET'], '/credit-cards/my'],
  [['GET', 'PATCH', 'DELETE'], '/credit-cards/{id}'],
  [['GET'], '/credit-cards/{id}/bills'],
  [['GET'], '/credit-cards/{id}/bills/{id}'],
  [['PUT'], '/credit-cards/{id}/bills/{id}/{billAction}'],
  [['GET'], '/credit-cards/{id}/bills/{id}/installments'],
  [['GET', 'POST'], '/credit-cards/{id}/purchases'],
  [['DELETE'], '/credit-cards/{id}/purchases/{id}'],
  [['GET', 'POST'], '/credit-cards/{id}/purchases/{id}/installments'],
  [['PUT', 'DELETE'], '/credit-cards/{id}/purchases/{id}/installments/{id}'],
  [['GET', 'POST'], '/credit-cards/{id}/bills/{id}/refunds'],
  [['DELETE'], '/credit-cards/{id}/bills/{id}/refunds/{id}'],
  [['GET'], '/assets'], [['POST'], '/assets/fixed-income'], [['POST'], '/assets/pension'],
  [['GET', 'PUT', 'DELETE'], '/assets/{id}'], [['PATCH'], '/assets/{id}/position'],
  [['GET'], '/assets/{id}/tax-suggestion'], [['GET'], '/assets/{id}/transactions'],
  [['POST'], '/assets/{id}/transactions/{assetAction}'],
  [['POST'], '/groups'], [['GET'], '/groups/my'], [['GET'], '/groups/my/responsible'],
  [['GET', 'PUT', 'DELETE'], '/groups/{id}'], [['PUT'], '/groups/{id}/transfer'],
  [['DELETE'], '/groups/{id}/leave'], [['GET'], '/groups/{id}/members'],
  [['GET'], '/groups/{id}/members/count'],
  [['GET', 'PUT'], '/groups/{id}/share/permissions'], [['GET'], '/groups/{id}/share/pockets'],
  [['POST'], '/invitations'], [['GET'], '/invitations/my/pending'],
  [['GET'], '/invitations/my/pending/count'], [['GET'], '/invitations/group/{id}'],
  [['PUT'], '/invitations/{id}/respond'], [['DELETE'], '/invitations/{id}'],
  [['GET', 'POST'], '/categories'], [['PATCH', 'DELETE'], '/categories/{id}'],
  [['GET', 'POST'], '/legal-entities'], [['GET', 'PATCH', 'DELETE'], '/legal-entities/{id}'],
  [['GET', 'POST'], '/employers/{employerType}'],
  [['GET', 'PATCH', 'DELETE'], '/employers/{employerType}/{id}'],
  [['GET'], '/admin/{reference}'], [['POST'], '/admin/categories'],
  [['PATCH', 'DELETE'], '/admin/categories/{id}'], [['GET'], '/notifications/stream']
];

const SEGMENTS: Readonly<Record<string, string>> = {
  id: '[1-9][0-9]*',
  summary: '(?:summary|monthly|issuer-risk|indexer-summary|liquidity-summary|net-profit)',
  pocketType: '(?:bank-accounts|benefit-accounts|fgts)',
  billAction: '(?:pay|reopen|close)', assetAction: '(?:buy|yield|sell)',
  employerType: '(?:individual|legal-entity)', reference: '(?:bank-account-types|benefit-types|card-brands)'
};

function compile(routes: readonly Route[]) {
  return routes.map(([methods, path]) => ({
    methods, pattern: new RegExp(`^${path.replace(/\{(\w+)\}/g, (_, key: string) => SEGMENTS[key])}$`)
  }));
}
const session = compile(SESSION_ROUTES);
const publicRoutes = compile(PUBLIC_ROUTES);
const protectedRoutes = compile(AUTH_PROTECTED_ROUTES);

function ambiguousPath(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return /[\\%\s\u0000-\u001f\u007f]/.test(path) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/.test(path) || /^(?:https?:\/\/\/|\/\/)/i.test(path);
}

export function classifyAuthRequest(
  url: string, method: string, apiUrl: string, baseUrl: string
): AuthRequestKind {
  try {
    if (ambiguousPath(url) || ambiguousPath(apiUrl)) return 'other';
    if (!(apiUrl.startsWith('/') || /^https?:\/\//i.test(apiUrl))) return 'other';
    const base = new URL(baseUrl);
    const api = new URL(apiUrl, base);
    const target = new URL(url, base);
    if (!['http:', 'https:'].includes(base.protocol) || !['http:', 'https:'].includes(api.protocol) ||
        api.username || api.password || api.search || api.hash ||
        target.username || target.password || target.hash || target.origin !== api.origin) return 'other';
    const prefix = api.pathname.replace(/\/+$/, '');
    if (!prefix || !target.pathname.startsWith(`${prefix}/`)) return 'other';
    const path = target.pathname.slice(prefix.length);
    const matches = (routes: ReturnType<typeof compile>) =>
      routes.some(route => route.methods.includes(method.toUpperCase()) && route.pattern.test(path));
    if (matches(session)) return 'session';
    if (matches(publicRoutes)) return 'public';
    return matches(protectedRoutes) ? 'protected' : 'other';
  } catch {
    return 'other';
  }
}
