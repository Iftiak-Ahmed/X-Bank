import { firebaseAuth } from "./firebase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

async function authHeader(forceRefresh = false): Promise<Record<string, string>> {
  const user = firebaseAuth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken(forceRefresh);
  return { Authorization: `Bearer ${token}` };
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

// The cached ID token can go stale (long-idle tab, clock skew) even though the
// user is still signed in — retry once with a force-refreshed token before
// surfacing "Invalid or expired token" to the UI.
function isExpiredTokenError(res: Response, body: string): boolean {
  return res.status === 401 && body.includes("Invalid or expired token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...(options.headers ?? {}),
  };
  let res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok && isExpiredTokenError(res, await res.clone().text())) {
    const retryHeaders = { ...headers, ...(await authHeader(true)) };
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers: retryHeaders });
  }
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  postForm: async <T>(path: string, formData: FormData): Promise<T> => {
    let res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: await authHeader(), body: formData });
    if (!res.ok && isExpiredTokenError(res, await res.clone().text())) {
      res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: await authHeader(true), body: formData });
    }
    if (!res.ok) throw new Error(await parseError(res));
    if (res.status === 204) return undefined as T;
    return res.json();
  },

  // For images/files behind auth (e.g. KYC documents) — <img src> can't send an
  // Authorization header, so we fetch the bytes and hand back an object URL.
  getBlobUrl: async (path: string): Promise<string> => {
    let res = await fetch(`${BASE_URL}${path}`, { headers: await authHeader() });
    if (!res.ok && isExpiredTokenError(res, await res.clone().text())) {
      res = await fetch(`${BASE_URL}${path}`, { headers: await authHeader(true) });
    }
    if (!res.ok) throw new Error(await parseError(res));
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
