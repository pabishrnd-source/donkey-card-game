import { useRef, useState } from "react";
import { CircleUserRound, Upload, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { prepareProfilePhoto, readProfile, saveProfile, useProfile, type Profile } from "@/lib/profile";
import "./Profile.css";
import { AccountButton } from "./AccountHub";

export function PlayerAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return avatarUrl ? <img className="player-photo" src={avatarUrl} alt={`${name}'s profile`} /> : <>{name.slice(0, 1).toUpperCase() || "P"}</>;
}

export function ProfileButton({ onSave }: { onSave?: (profile: Profile) => void }) {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  return <>
    <AccountButton />
    <button type="button" className="profile-button" onClick={() => { setDraft(readProfile()); setError(""); setOpen(true); }} title="Profile" aria-label="Profile">
      <span className="profile-avatar">{profile.avatarUrl ? <PlayerAvatar {...profile} /> : <CircleUserRound size={22} />}</span><span>Profile</span>
    </button>
    <Dialog open={open} onOpenChange={value => { request.current++; setBusy(false); setOpen(value); }}>
      <DialogContent className="profile-dialog">
        <DialogHeader><DialogTitle>Profile</DialogTitle><DialogDescription>Your name and photo are shared with players in your room.</DialogDescription></DialogHeader>
        <form onSubmit={event => {
          event.preventDefault();
          if (busy) return;
          const next = { ...draft, name: draft.name.trim().slice(0, 20) };
          if (!next.name) { setError("Enter your player name."); return; }
          try { saveProfile(next); onSave?.(next); setOpen(false); } catch { setError("Could not save your profile. Device storage may be full."); }
        }}>
          <div className="profile-photo-row"><span className="profile-preview"><PlayerAvatar {...draft} /></span>
            <label className="profile-upload"><Upload size={18} />Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile photo" disabled={busy} onChange={async event => {
              const file = event.target.files?.[0]; event.target.value = "";
              if (!file) return;
              const id = ++request.current; setBusy(true); setError("");
              try { const avatarUrl = await prepareProfilePhoto(file); if (request.current === id) setDraft(value => ({ ...value, avatarUrl })); }
              catch (reason) { if (request.current === id) setError(reason instanceof Error ? reason.message : "Could not read this photo."); }
              finally { if (request.current === id) setBusy(false); }
            }} /></label>
            {draft.avatarUrl && <button type="button" title="Remove photo" aria-label="Remove photo" disabled={busy} onClick={() => setDraft(value => ({ ...value, avatarUrl: null }))}><Trash2 size={20} /></button>}
          </div>
          <label htmlFor="profile-name">Player name</label>
          <input id="profile-name" autoComplete="nickname" maxLength={20} value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} required />
          {error && <p role="alert">{error}</p>}
          <button className="profile-save" type="submit" disabled={busy}>{busy ? "Preparing photo..." : "Save profile"}</button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
