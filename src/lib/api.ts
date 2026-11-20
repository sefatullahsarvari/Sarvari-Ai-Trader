export function getApiBaseUrl(): string {
  const metaEnv = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env;
  const raw = (metaEnv?.VITE_API_BASE_URL ?? '').trim();
  if (!raw) {
    return '';
  }
  return raw.replace(/\/+$/, '');
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
