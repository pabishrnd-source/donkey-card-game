import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
export const nearbyAvailable = Capacitor.getPlatform() === "android";
export interface NearbyPacket { type: "message" | "closed"; peer: string; data: string }
export const Nearby = registerPlugin<{
  host(): Promise<{ addresses: string[] }>;
  join(options: { address: string }): Promise<void>;
  send(options: { peer: string; data: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: "packet", listener: (packet: NearbyPacket) => void): Promise<PluginListenerHandle>;
}>("Nearby");
