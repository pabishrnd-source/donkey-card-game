export const API_URL =
  import.meta.env.VITE_API_URL?.trim() || window.location.origin;

export const WS_URL =
  import.meta.env.VITE_WS_URL?.trim() ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
