import { Router } from "express";
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EventEmitter } from "node:events";

export const sessionEvents = new EventEmitter();

interface User { id: string; username: string; salt: string; hash: string }
interface Store {
  users: User[];
  sessions: { hash: string; userId: string; expires: number }[];
  friends: [string, string][];
  requests: { from: string; to: string }[];
}
const path = resolve(process.env.ACCOUNTS_FILE || ".data/accounts.json");
let data: Store | undefined;
function store(): Store {
  if (!data) {
    data = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Store : { users: [], sessions: [], friends: [], requests: [] };
    if (!Array.isArray(data.users) || !Array.isArray(data.sessions) || !Array.isArray(data.friends) || !Array.isArray(data.requests)) throw new Error("Invalid accounts store");
  }
  return data;
}
// Single-server persistence: commit an atomic replacement before publishing changes.
function commit(update: (next: Store) => void) {
  const next = structuredClone(store());
  update(next);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = path + ".tmp";
  writeFileSync(temporaryPath, JSON.stringify(next), { mode: 0o600 });
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      renameSync(temporaryPath, path);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES") throw error;
      // Windows can briefly hold the destination while its file scanner releases it.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  if (lastError) throw lastError;
  data = next;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) =>
  scrypt(password, salt, 64, { N: 65536, maxmem: 128 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
export const publicUser = (id: string) => {
  const user = store().users.find(user => user.id === id);
  return user ? { id: user.id, username: user.username } : null;
};
export function tokenUser(token: string) {
  if (token.length !== 64) return null;
  const session = store().sessions.find(session => session.hash === digest(token) && session.expires > Date.now());
  return session ? publicUser(session.userId) : null;
}
export function areFriends(a: string, b: string) {
  return store().friends.some(pair => pair.includes(a) && pair.includes(b) && a !== b);
}
export function friendData(id: string) {
  return {
    friends: store().friends.filter(pair => pair.includes(id)).map(pair => publicUser(pair.find(value => value !== id)!)).filter(Boolean),
    incoming: store().requests.filter(request => request.to === id).map(request => publicUser(request.from)).filter(Boolean),
    outgoing: store().requests.filter(request => request.from === id).map(request => publicUser(request.to)).filter(Boolean),
  };
}
export function requestFriend(from: string, username: string) {
  const to = store().users.find(user => user.username === username.trim().toLowerCase())?.id;
  if (!to || from === to) throw new Error("Player not found or this is your own account.");
  if (areFriends(from, to)) throw new Error("Already friends.");
  if (store().requests.some(request => request.from === from && request.to === to)) return;
  if (store().requests.filter(request => request.from === from || request.to === to).length >= 100) throw new Error("Too many pending friend requests.");
  commit(next => { next.requests.push({ from, to }); });
}
export function answerFriend(id: string, from: string, accept: boolean) {
  if (!store().requests.some(request => request.from === from && request.to === id)) throw new Error("Friend request no longer exists.");
  commit(next => {
    next.requests = next.requests.filter(request => !(request.from === from && request.to === id) && !(request.from === id && request.to === from));
    if (accept && !areFriends(id, from)) next.friends.push([id, from]);
  });
}
export function removeFriend(id: string, other: string) {
  commit(next => {
    next.friends = next.friends.filter(pair => !(pair.includes(id) && pair.includes(other)));
    next.requests = next.requests.filter(request => !(request.from === id && request.to === other) && !(request.from === other && request.to === id));
  });
}

export const authRouter = Router();
const attempts = new Map<string, { count: number; until: number }>();
let activeHashes = 0;
authRouter.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
  const username = String(req.body?.username || "").trim().toLowerCase().slice(0, 40);
  const keys = ["ip:" + (req.ip || "unknown"), ...(username ? ["user:" + username] : [])];
  if (attempts.size > 10000) { res.status(429).json({ error: "Account service busy. Try again later." }); return; }
  if (keys.some(key => (attempts.get(key)?.count || 0) >= 15) || activeHashes >= 4) {
    res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." }); return;
  }
  for (const key of keys) {
    const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
    entry.count++; attempts.set(key, entry);
  }
  next();
});
authRouter.post("/:action", async (req, res) => {
  const action = req.params.action;
  const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
  if (action === "logout") {
    if (tokenUser(token)) {
      commit(next => { next.sessions = next.sessions.filter(session => session.hash !== digest(token)); });
      sessionEvents.emit("changed");
    }
    res.json({ ok: true }); return;
  }
  if (!["register", "login", "password"].includes(action)) { res.sendStatus(404); return; }
  const username = String(req.body?.username ?? "").trim().toLowerCase();
  const password = req.body?.password;
  // Existing longer passwords remain valid for sign-in and password changes.
  if (typeof password !== "string" || password.length < (action === "register" ? 6 : 1) || password.length > (action === "register" ? 15 : 128) ||
      (action !== "password" && !/^[a-z0-9_]{3,20}$/.test(username))) {
    res.status(400).json({ error: "Use a 3-20 character username (letters, numbers, underscore) and a 6-15 character password for new accounts." }); return;
  }
  activeHashes++;
  try {
    let user = action === "password"
      ? store().users.find(user => user.id === tokenUser(token)?.id)
      : store().users.find(user => user.username === username);
    if (action === "register") {
      if (user) { res.status(409).json({ error: "Username is already taken." }); return; }
      const salt = randomBytes(16).toString("hex");
      const hash = (await derive(password, salt)).toString("hex");
      if (store().users.some(user => user.username === username)) { res.status(409).json({ error: "Username is already taken." }); return; }
      user = { id: randomUUID(), username, salt, hash };
      commit(next => { next.users.push(user!); });
    } else {
      const key = await derive(password, user?.salt || "invalid-account-salt");
      if (!user || !timingSafeEqual(key, Buffer.from(user.hash, "hex"))) {
        res.status(401).json({ error: "Username or password is incorrect." }); return;
      }
      if (store().users.find(value => value.id === user!.id)?.hash !== user.hash) {
        res.status(401).json({ error: "Password changed. Please sign in again." }); return;
      }
      if (action === "password") {
        const nextPassword = req.body.newPassword;
        if (typeof nextPassword !== "string" || nextPassword.length < 6 || nextPassword.length > 15) {
          res.status(400).json({ error: "New password must be 6-15 characters." }); return;
        }
        const salt = randomBytes(16).toString("hex");
        const hash = (await derive(nextPassword, salt)).toString("hex");
        if (!tokenUser(token) || store().users.find(value => value.id === user!.id)?.hash !== user.hash) {
          res.status(401).json({ error: "Session changed. Please sign in again." }); return;
        }
        commit(next => {
          Object.assign(next.users.find(value => value.id === user!.id)!, { salt, hash });
          next.sessions = next.sessions.filter(session => session.userId !== user!.id);
        });
        sessionEvents.emit("changed");
      }
    }
    const sessionToken = randomBytes(32).toString("hex");
    commit(next => {
      next.sessions = next.sessions.filter(session => session.expires > Date.now());
      next.sessions.push({ hash: digest(sessionToken), userId: user!.id, expires: Date.now() + 7 * 86400_000 });
    });
    res.json({ token: sessionToken, user: publicUser(user.id) });
  } catch {
    res.status(500).json({ error: "Account service unavailable. Please try again." });
  } finally { activeHashes--; }
});
