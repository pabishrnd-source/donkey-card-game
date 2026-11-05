import { type Card } from "./gameEngine.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export function isCard(value: unknown): value is Card {
  return isRecord(value) &&
    typeof value.suit === "string" && typeof value.rank === "string" &&
    ["hearts", "diamonds", "clubs", "spades"].includes(value.suit) &&
    ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].includes(value.rank);
}

// Validate JSON at the trust boundary; TypeScript casts do not validate network data.
const fields: Record<string, Record<string, "string" | "boolean" | "number" | "card" | "object">> = {
  authenticate: { token: "string" },
  social_refresh: {}, sign_out: {},
  friend_request: { username: "string" },
  friend_answer: { userId: "string", accept: "boolean" },
  friend_remove: { userId: "string" }, match_invite: { userId: "string" },
  invite_answer: { inviteId: "string", accept: "boolean" },
  create_game: { playerName: "string" },
  join_game: { gameId: "string", playerName: "string" },
  resume_game: { gameId: "string", playerId: "string" },
  update_profile: { gameId: "string", playerName: "string" },
  remove_player: { gameId: "string", playerId: "string" },
  select_dealer: { gameId: "string", playerId: "string" },
  start_game: { gameId: "string", dealNumber: "number" },
  play_card: { gameId: "string", card: "card" },
  chat_message: { gameId: "string", text: "string" },
  voice_join: { gameId: "string" }, voice_leave: { gameId: "string" },
  leave_game: { gameId: "string" }, restart_tournament: { gameId: "string" },
  restart_game: { gameId: "string", dealNumber: "number" },
  voice_music: { gameId: "string", title: "string", playing: "boolean" },
  voice_signal: { gameId: "string", toPlayerId: "string", signal: "object" },
  voice_chunk: { gameId: "string", mimeType: "string", data: "string" },
};
export function validMessage(value: unknown): value is { type: string; payload: Record<string, unknown> } {
  if (!isRecord(value) || typeof value.type !== "string" ||
      !Object.hasOwn(fields, value.type) || !isRecord(value.payload)) return false;
  const payload = value.payload;
  for (const [key, kind] of Object.entries(fields[value.type])) {
    const field = payload[key];
    if (kind === "card") { if (!isCard(field)) return false; }
    else if (kind === "object") { if (!isRecord(field)) return false; }
    else if (typeof field !== kind) return false;
    if (kind === "string" && (field as string).length > (key === "data" ? 120000 : key === "text" ? 240 : 160)) return false;
    if (kind === "number" && (!Number.isSafeInteger(field) || (field as number) < 0)) return false;
  }
  if (payload.resumeToken !== undefined && (typeof payload.resumeToken !== "string" || payload.resumeToken.length > 64)) return false;
  if (payload.avatarUrl != null && (typeof payload.avatarUrl !== "string" || payload.avatarUrl.length > 60000)) return false;
  return true;
}

export function messageBudget() {
  let started = Date.now(), messages = 0, bytes = 0;
  return (size: number) => {
    const now = Date.now();
    if (now - started >= 1000) { started = now; messages = 0; bytes = 0; }
    messages++;
    bytes += size;
    return messages <= 80 && bytes <= 1024 * 1024;
  };
}
