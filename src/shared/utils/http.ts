async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildError(url: string, response: Response, data: unknown) {
  const error = new Error(`HTTP ${response.status} for ${url}`) as Error & {
    status?: number;
    data?: unknown;
  };

  error.status = response.status;
  error.data = data;
  return error;
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const dateMs = new Date(retryAfter).getTime();
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }

  return Math.min(1000 * 2 ** attempt, 8000);
}

function shouldRetry(response: Response, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) return false;
  return response.status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let attempt = 0;

  while (true) {
    const response = await fetch(url, options);

    if (!shouldRetry(response, attempt, maxRetries)) {
      return response;
    }

    const delayMs = getRetryDelayMs(response, attempt);
    attempt += 1;
    await sleep(delayMs);
  }
}

export async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithRetry(url, options);
  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw buildError(url, response, data);
  }

  return data as T;
}

export async function fetchJsonWithMeta<T>(url: string, options: RequestInit = {}): Promise<{
  data: T;
  headers: Headers;
  status: number;
}> {
  const response = await fetchWithRetry(url, options);
  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw buildError(url, response, data);
  }

  return {
    data: data as T,
    headers: response.headers,
    status: response.status
  };
}
