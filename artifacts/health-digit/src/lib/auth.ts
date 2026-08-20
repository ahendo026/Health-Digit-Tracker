const TOKEN_KEY = "healthdigits_device_token";

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export const loginPath = (): string => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/login`;

/** Full-page redirect to the login page (wipes the query cache); no-op if already there. */
export function redirectToLogin(): void {
  if (window.location.pathname !== loginPath()) {
    window.location.assign(loginPath());
  }
}
