const TOKEN_KEY = "donkey-account-token";
let currentToken: string | null | undefined;

export function readAccountToken(): string | null {
  if (currentToken !== undefined) return currentToken;
  try { return window.localStorage.getItem(TOKEN_KEY); }
  catch { return null; }
}

export function saveAccountToken(token: string | null): void {
  // Keep this session usable even when storage is blocked or full.
  currentToken = token;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* Persistence is optional; server authentication is not. */ }
}
