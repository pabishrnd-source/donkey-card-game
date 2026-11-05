import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { UsersRound, UserPlus, UserMinus, Send, Check, X, LogOut, Shield, Crown, UserRound, UsersRound as SwitchAccount, ChevronRight, Home, Settings, Spade } from "lucide-react";
import type { UseGameSocketReturn } from "@/hooks/useGameSocket";
import { API_URL } from "@/lib/apiConfig";
import { validateAccount } from "@/lib/accountValidation";
import { readAccountToken } from "@/lib/accountToken";
import { readProfile, saveProfile } from "@/lib/profile";
import { X as CloseIcon } from "lucide-react";
import "./AccountHub.css";
import "./EmeraldLogin.css";
import "./EmeraldFriends.css";
import "./VillageLogin.css";
import "./VillageSignIn.css";

const AccountContext = createContext<{ socket: UseGameSocketReturn; open: () => void } | null>(null);
export function AccountButton() {
  const context = useContext(AccountContext);
  if (!context) return null;
  const count = context.socket.social.incoming.length + context.socket.social.invitations.length;
  return <button className="account-button" type="button" onClick={context.open} title="Account & friends" aria-label={count ? `Account & friends, ${count} requests` : "Account & friends"}>
    <UsersRound size={19} /><span>{context.socket.social.user ? "Friends" : "Sign in"}</span>{count > 0 && <b>{count}</b>}
  </button>;
}
export function AccountProvider({ socket, children, onLocal }: { socket: UseGameSocketReturn; children: ReactNode; onLocal: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Start on the full sign-in panel after the intro; the welcome-back screen
  // appears only after authentication and confirmation is the next step.
  const [showAccountLogin, setShowAccountLogin] = useState(true);
  const rememberedName = readProfile().name.trim();
  const welcomeName = socket.social.user?.username || rememberedName || "pabish";
  const showWelcome = !showAccountLogin;
  if (!socket.social.user || !confirmed) return <main className={`account-login-screen${showWelcome ? " village-welcome-screen" : " village-signin-screen"}`}>
    <img className="emerald-login-art" src={`${import.meta.env.BASE_URL}${showWelcome ? "donkey-tropical-results-mascot.png" : "donkey-village-signin.png"}`} alt="" aria-hidden="true" fetchPriority="high" />
    {showWelcome ? <section className="village-login-sign" aria-labelledby="village-login-title">
      <img className="village-login-skin" src={`${import.meta.env.BASE_URL}donkey-village-login-panel.png`} alt="" aria-hidden="true" fetchPriority="high" />
      <h1 id="village-login-title" className="sr-only">Donkey</h1>
      <p className="village-login-greeting">Welcome back</p>
      <button className="magician-hit magician-play" type="button" disabled={!socket.connected} onClick={() => setConfirmed(true)} aria-label={`Play Now as ${welcomeName}`} />
      <button className="magician-hit magician-create" type="button" onClick={() => setConfirmed(true)} aria-label="Create Room" />
      <button className="magician-hit magician-join" type="button" onClick={() => setConfirmed(true)} aria-label="Join Room" />
      <button className="magician-hit magician-rules" type="button" onClick={() => setConfirmed(true)} aria-label="How to Play" />
      <button className="magician-hit magician-leaderboard" type="button" onClick={() => setConfirmed(true)} aria-label="Leaderboard" />
      <button className="magician-hit magician-friends" type="button" onClick={() => setConfirmed(true)} aria-label="Friends" />
      <button className="magician-hit magician-rewards" type="button" onClick={() => setConfirmed(true)} aria-label="Rewards" />
      <button className="magician-hit magician-account" type="button" onClick={() => { if (socket.social.user) socket.forgetAccount(); setShowAccountLogin(true); setConfirmed(false); }} aria-label="Use another account" />
      <button className="magician-hit magician-notifications" type="button" onClick={() => setConfirmed(true)} aria-label="Notifications" />
      {!socket.connected && <p className="village-login-status" role="status">Reconnecting to server...</p>}
    </section> : <section className="account-login-box village-card-panel">
      <Crown className="emerald-login-crown" aria-hidden="true" />
      <h1>Donkey</h1>
      <p className="emerald-login-greeting">{socket.social.user ? "Welcome back" : "Welcome to the table"}</p>
      <AccountPanel socket={socket} forceSignIn initialUsername={rememberedName || "pabish"} onAuthenticated={() => { setConfirmed(true); setShowAccountLogin(true); }} />
    </section>}
  </main>;
  return <AccountContext.Provider value={{ socket, open: () => { socket.clearError(); setOpen(true); } }}>
    {children}
    {open && <div className="account-art-overlay" role="dialog" aria-modal="true" aria-labelledby="account-art-title">
      <div className="account-art-dialog">
        <img className="account-art-image" src={`${import.meta.env.BASE_URL}rustic-account-friends-ui.png?v=20261102`} alt="Account and Friends" />
        <h2 id="account-art-title" className="sr-only">Account and friends</h2>
        <span className="account-art-signed">Signed in as {socket.social.user?.username || "Player"}</span>
        <button type="button" className="account-art-close" onClick={() => setOpen(false)} aria-label="Close Account and Friends"><CloseIcon aria-hidden="true" /></button>
        <AccountPanel socket={socket} />
      </div>
    </div>}
  </AccountContext.Provider>;
}
function AccountPanel({ socket, onAuthenticated, initialUsername = "", forceSignIn = false }: { socket: UseGameSocketReturn; onAuthenticated?: () => void; initialUsername?: string; forceSignIn?: boolean }) {
  const { social, connected, gameState, myPlayerId, sendMessage } = socket;
  const [tab, setTab] = useState("friends");
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [friendName, setFriendName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const admin = Boolean(gameState && gameState.hostId === myPlayerId);
  // Wait for the server to assign the new room before sending its invitation.
  useEffect(() => {
    if (!pendingInvite || !gameState || !admin || gameState.phase !== "lobby") return;
    sendMessage({ type: "match_invite", payload: { userId: pendingInvite } });
    setPendingInvite(null);
  }, [pendingInvite, gameState, admin, sendMessage]);
  useEffect(() => {
    if (socket.error || !connected) setPendingInvite(null);
  }, [socket.error, connected]);
  useEffect(() => {
    if (!pendingInvite) return;
    const timer = window.setTimeout(() => { setPendingInvite(null); setError("Room creation timed out. Please try again."); }, 15000);
    return () => window.clearTimeout(timer);
  }, [pendingInvite]);
  function inviteFriend(userId: string) {
    if (pendingInvite || !connected) return;
    socket.clearError(); setError("");
    if (!gameState) {
      setPendingInvite(userId);
      sendMessage({ type: "create_game", payload: { playerName: social.user!.username, avatarUrl: readProfile().avatarUrl } });
    } else sendMessage({ type: "match_invite", payload: { userId } });
  }
  async function accountAction(action: string) {
    if (busy) return;
    socket.clearError();
    if (action === "register" || action === "login") {
      const validation = validateAccount(username, password, action === "register");
      if (validation) { setError(validation); return; }
    }
    setBusy(true); setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_URL}/api/auth/${action}`, {
        signal: controller.signal,
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${readAccountToken() || ""}` },
        body: JSON.stringify({ username: username.trim(), password, newPassword }),
      });
      const result = await response.json().catch(() => { throw new Error("Account server returned an invalid response. Please try again."); });
      if (!response.ok) throw new Error(result.error || "Account request failed.");
      if (action === "logout") {
        socket.forgetAccount();
      } else {
        // A local profile preference must not reject a successful server login.
        try { saveProfile({ ...readProfile(), name: result.user.username }); }
        catch { /* Profile editing still reports persistence failures separately. */ }
        socket.authenticate(result.token);
        onAuthenticated?.();
      }
      setPassword(""); setNewPassword("");
    } catch (reason) {
      setError(controller.signal.aborted ? "Account request timed out. Check the connection and try again."
        : reason instanceof TypeError ? "Cannot reach the account server. Keep the laptop running and reconnect USB."
        : reason instanceof Error ? reason.message : "Unable to reach the account server.");
    }
    finally { clearTimeout(timeout); setBusy(false); }
  }
  const button = (label: string, action: () => void, icon: ReactNode, disabled = false) =>
    <button type="button" title={label} aria-label={label} disabled={!connected || disabled} onClick={action}>{icon}</button>;
  return <div className="account-panel">
    {(error || socket.error) && <p role="alert" className="account-error">{error || socket.error}</p>}
    {!connected && <p role="status">Server disconnected. Reconnecting...</p>}
    {!social.user || forceSignIn ? <>
      <div className={`account-tabs ${register ? "is-register" : "is-sign-in"}`}><button type="button" aria-pressed={!register} onClick={() => { setRegister(false); setError(""); socket.clearError(); }}>Sign In</button><button type="button" aria-pressed={register} onClick={() => { setRegister(true); setError(""); socket.clearError(); }}>Create Account</button></div>
      <form className={`account-signin-form ${register ? "is-register" : "is-sign-in"}`} noValidate onSubmit={event => { event.preventDefault(); void accountAction(register ? "register" : "login"); }}>
        <label>Username<input name="donkey-login-user" autoComplete="off" data-1p-ignore="true" data-lpignore="true" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" required value={username} onChange={event => setUsername(event.target.value)} /></label>
        <label>Password<input name="donkey-login-pass" type="password" autoComplete="off" data-1p-ignore="true" data-lpignore="true" minLength={register ? 6 : 1} maxLength={register ? 15 : 128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        {!register && <div className="signin-options">
          <label className="remember-option"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} /><span>Remember me</span></label>
          <button className="forgot-password" type="button" onClick={() => setError("Password recovery is not configured yet.")}>Forgot Password?</button>
        </div>}
        <p className="account-note">Username: 3-20 letters, numbers or underscores. New passwords: 6-15 characters. No SMS required.</p>
        <button disabled={busy || !connected} type="submit">{busy ? "Please wait..." : register ? "Create account" : "Sign in"}</button>
      </form>
    </> : <>
      <div className="account-tabs" role="tablist" aria-label="Account views">{["friends", "room", "account"].map(value => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setError(""); }}>{value === "friends" ? <UsersRound size={20} aria-hidden="true" /> : value === "room" ? <Home size={20} aria-hidden="true" /> : <Settings size={20} aria-hidden="true" />}{value}</button>)}</div>
      {tab === "friends" && <section aria-label="Friends">
        <form className="friend-search" onSubmit={event => { event.preventDefault(); socket.clearError(); sendMessage({ type: "friend_request", payload: { username: friendName } }); }}>
          <label className="sr-only" htmlFor="friend-username">Friend username</label><input id="friend-username" placeholder="Friend username" required maxLength={20} value={friendName} onChange={event => setFriendName(event.target.value)} />
          <button type="submit" disabled={!connected} title="Send friend request" aria-label="Send friend request"><UserPlus size={19} /></button>
        </form>
        {socket.socialNotice && <p role="status">{socket.socialNotice}</p>}
        {social.invitations.map(invite => <div className="friend-row" key={invite.id}><div><strong>{invite.fromName}</strong><small>Invited you to {invite.gameId}</small></div>
          {button("Accept match invitation", () => sendMessage({ type: "invite_answer", payload: { inviteId: invite.id, accept: true } }), <Check size={18} />, Boolean(gameState))}
          {button("Decline match invitation", () => sendMessage({ type: "invite_answer", payload: { inviteId: invite.id, accept: false } }), <X size={18} />)}
        </div>)}
        {social.invitations.length > 0 && gameState && <p className="account-note">Leave your current room before accepting another match.</p>}
        {social.incoming.map(user => <div className="friend-row" key={user.id}><div><strong>{user.username}</strong><small>Friend request</small></div>
          {button(`Accept ${user.username}`, () => sendMessage({ type: "friend_answer", payload: { userId: user.id, accept: true } }), <Check size={18} />)}
          {button(`Decline ${user.username}`, () => sendMessage({ type: "friend_answer", payload: { userId: user.id, accept: false } }), <X size={18} />)}
        </div>)}
        <h3>Friends ({social.friends.filter(friend => friend.online).length} online)</h3>
        {social.friends.length === 0 && <p className="account-note">No friends yet.</p>}
        {social.friends.map(friend => <div className="friend-row" key={friend.id}><span className="friend-emblem" aria-hidden="true"><Spade fill="currentColor" size={24} /></span><div><strong>{friend.username}</strong><small className={friend.online ? "friend-online" : ""}>{friend.online ? "Online" : "Offline"}</small></div>
          <button className="friend-invite" type="button" aria-label={`${gameState ? "Invite" : "Create room and invite"} ${friend.username}`} disabled={!connected || !friend.online || Boolean(pendingInvite) || Boolean(gameState && (!admin || gameState.phase !== "lobby" || gameState.players.length >= 10 || gameState.players.some(player => player.accountId === friend.id)))} onClick={() => inviteFriend(friend.id)}><Send size={18} aria-hidden="true" /><span>{pendingInvite === friend.id ? "Creating..." : gameState ? "Invite" : "Create & invite"}</span></button>
          {button(`Remove friend ${friend.username}`, () => sendMessage({ type: "friend_remove", payload: { userId: friend.id } }), <UserMinus size={18} />)}
        </div>)}
        {social.friends.length > 0 && gameState && (!admin || gameState.phase !== "lobby") && <p className="account-note">{!admin ? "Only the room host can invite friends." : "Invitations are available in the waiting room."}</p>}
        {social.outgoing.map(user => <div className="friend-row" key={user.id}><div><strong>{user.username}</strong><small>Request sent</small></div>
          {button(`Cancel request to ${user.username}`, () => sendMessage({ type: "friend_remove", payload: { userId: user.id } }), <X size={18} />)}
        </div>)}
      </section>}
      {tab === "room" && <section aria-label="Room players">
        <h3>{gameState ? `Room ${gameState.gameId}` : "Not in a room"}</h3>
        {gameState?.players.map(player => <div className="friend-row" key={player.id}><div><strong>{player.name} {player.id === gameState.hostId && <Shield size={15} />}</strong><small>{player.id === gameState.hostId ? "Admin" : player.username || "Guest player"}</small></div>
          {player.id !== myPlayerId && player.username && !social.friends.some(friend => friend.id === player.accountId) &&
            button(`Add ${player.name} as friend`, () => sendMessage({ type: "friend_request", payload: { username: player.username! } }), <UserPlus size={18} />)}
          {admin && player.id !== myPlayerId && button(`Remove ${player.name} from room`, () => setRemoveId(player.id), <UserMinus size={18} />)}
        </div>)}
        {removeId && <div className="remove-confirm"><p>Remove this player? Any unfinished deal will be cancelled and the remaining players return to the waiting room.</p>
          <button type="button" onClick={() => { if (gameState) sendMessage({ type: "remove_player", payload: { gameId: gameState.gameId, playerId: removeId } }); setRemoveId(null); }}>Remove player</button>
          <button type="button" onClick={() => setRemoveId(null)}>Cancel</button>
        </div>}
      </section>}
      {tab === "account" && <section><h3>{social.user.username}</h3>
        <form onSubmit={event => { event.preventDefault(); void accountAction("password"); }}>
          <label>Current password<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label>New password<input type="password" autoComplete="new-password" required minLength={6} maxLength={15} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy || !connected}>Change password</button>
        </form>
        <button type="button" disabled={busy || !connected} onClick={() => void accountAction("logout")}><LogOut size={18} />Sign out and leave room</button>
        <p className="account-note">Keep your password safe. Email/SMS password recovery is not configured.</p>
      </section>}
    </>}
  </div>;
}
