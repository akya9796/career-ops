const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; career-ops/1.13)';

export async function fetchWithTimeout(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = {},
  method = 'GET',
  body = null,
  redirect = 'follow',
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: { 'user-agent': DEFAULT_USER_AGENT, ...headers },
      body,
      redirect,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
