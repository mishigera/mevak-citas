import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function getErrorMessage(error: unknown, fallback = "Error inesperado"): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function toBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("API URL is empty");
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return new URL(value).href;
  }
  return new URL(`https://${value}`).href;
}

export function getApiUrl(): string {
  const explicitApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (explicitApiUrl) return toBaseUrl(explicitApiUrl);

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return toBaseUrl(domain);

  const browserLocation = (globalThis as { location?: { protocol?: string; host?: string } }).location;
  if (browserLocation?.host) {
    const protocol = browserLocation.protocol || "http:";
    return `${protocol}//${browserLocation.host}/`;
  }

  return "http://localhost:5000/";
}

let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
}

function buildHeaders(data?: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const rawBody = (await res.text()).trim();
    let details: unknown;
    let message = res.statusText || `HTTP ${res.status}`;

    if (rawBody) {
      try {
        details = JSON.parse(rawBody) as unknown;
      } catch {
        details = rawBody;
      }

      if (typeof details === "string") {
        message = details;
      } else if (details && typeof details === "object") {
        const maybeMessage = (details as { message?: unknown }).message;
        message = typeof maybeMessage === "string" ? maybeMessage : rawBody;
      }
    }

    throw new ApiError(res.status, message, details);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const res = await fetch(url.toString(), {
    method,
    headers: buildHeaders(data),
    body: data ? JSON.stringify(data) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);
    const res = await fetch(url.toString(), {
      headers: buildHeaders(),
    });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
