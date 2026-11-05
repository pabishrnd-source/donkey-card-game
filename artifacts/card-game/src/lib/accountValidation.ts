export function validateAccount(username: string, password: string, registering = true): string | null {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username.trim())) {
    return "Username must be 3-20 letters, numbers or underscores, with no spaces inside.";
  }
  if (password.length < (registering ? 6 : 1) || password.length > (registering ? 15 : 128)) {
    return registering ? "Password must be 6-15 characters." : "Enter your password.";
  }
  return null;
}
