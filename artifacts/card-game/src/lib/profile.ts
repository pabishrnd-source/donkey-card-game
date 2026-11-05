import { useEffect, useState } from "react";

export interface Profile { name: string; avatarUrl: string | null }
export function readProfile(): Profile {
  try {
    return { name: localStorage.getItem("donkey-player-name") ?? "", avatarUrl: localStorage.getItem("donkey-player-photo") };
  } catch { return { name: "", avatarUrl: null }; }
}
export function saveProfile(profile: Profile) {
  // Saving must fail visibly if storage is full, not pretend the photo persisted.
  if (profile.avatarUrl) localStorage.setItem("donkey-player-photo", profile.avatarUrl);
  else localStorage.removeItem("donkey-player-photo");
  localStorage.setItem("donkey-player-name", profile.name);
  window.dispatchEvent(new Event("donkey-profile-changed"));
}
export function useProfile() {
  const [profile, setProfile] = useState(readProfile);
  useEffect(() => {
    const update = () => setProfile(readProfile());
    window.addEventListener("donkey-profile-changed", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("donkey-profile-changed", update); window.removeEventListener("storage", update); };
  }, []);
  return profile;
}

export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP photo.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose a photo smaller than 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 160;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable.");
    // A small square JPEG strips metadata and bounds room-state message size.
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = "#163c30";
    context.fillRect(0, 0, 160, 160);
    context.drawImage(image, (image.naturalWidth-edge)/2, (image.naturalHeight-edge)/2, edge, edge, 0, 0, 160, 160);
    const result = canvas.toDataURL("image/jpeg", 0.8);
    if (result.length > 60000) throw new Error("This photo is too complex. Choose a smaller photo.");
    return result;
  } finally { URL.revokeObjectURL(url); }
}
