const DEFAULT_API_URL = 'http://localhost:3000';

function resolveApiBaseUrl(value = '') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) {
    return DEFAULT_API_URL;
  }

  return candidate.replace(/\/+$/, '');
}

function getBrowserApiBaseUrl() {
  if (typeof window === 'undefined') {
    return DEFAULT_API_URL;
  }

  const config = window.__APP_CONFIG__ || {};
  return resolveApiBaseUrl(config.apiUrl || config.apiURL || '');
}

function buildApiUrl(path = '/', customBase = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = customBase || getBrowserApiBaseUrl();
  const resolvedBase = resolveApiBaseUrl(base);

  if (!customBase && !window.__APP_CONFIG__?.apiUrl && !window.__APP_CONFIG__?.apiURL) {
    return normalizedPath;
  }

  return `${resolvedBase}${normalizedPath}`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_API_URL,
    resolveApiBaseUrl,
    getBrowserApiBaseUrl,
    buildApiUrl
  };
}

if (typeof window !== 'undefined') {
  window.__APP_CONFIG__ = window.__APP_CONFIG__ || {};
}
