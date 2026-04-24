export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, { ...options, signal });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.error ?? body.message ?? message;
    } catch {
      // ignore parse error; use default message
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}
