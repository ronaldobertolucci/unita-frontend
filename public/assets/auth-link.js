// Runs before Angular/resources. Only transfers an incoming link into memory.
(function () {
  var path = window.location.pathname;
  if (path !== '/verify-email' && path !== '/reset-password') return;
  var url = new URL(window.location.href);
  var tokens = url.searchParams.getAll('token');
  url.searchParams.delete('token');
  url.hash = '';
  var cleaned = false;
  try {
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
    cleaned = true;
  } catch (_) { tokens = []; }
  window.__UNITA_AUTH_LINK__ = { path: path, tokens: tokens, cleaned: cleaned };
}());
