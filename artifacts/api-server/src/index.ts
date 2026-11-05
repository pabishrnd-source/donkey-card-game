import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { handleMessage, handleDisconnect } from "./lib/gameManager.js";
import { messageBudget } from "./lib/messageSecurity.js";

const rawPort = process.env["PORT"] ?? "3001";

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Create an HTTP server that wraps Express, so we can attach the WebSocket server
const server = http.createServer(app);

// WebSocket server attached to the same HTTP server
// The client connects to /ws path
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 256 * 1024 });
const alive = new WeakSet<WebSocket>();
const ipConnections = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 20;
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) { ws.terminate(); continue; }
    alive.delete(ws); ws.ping();
  }
}, 30000);
heartbeat.unref();
wss.on("close", () => clearInterval(heartbeat));

wss.on("connection", (ws: WebSocket, request) => {
  if (wss.clients.size > 1000) { ws.close(1013, "Server busy"); return; }
  const remoteAddress = request.socket.remoteAddress ?? "unknown";
  const currentConnections = ipConnections.get(remoteAddress) ?? 0;
  if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
    ws.close(1013, "Too many connections from this address");
    return;
  }
  ipConnections.set(remoteAddress, currentConnections + 1);
  let released = false;
  const releaseConnection = () => {
    if (released) return;
    released = true;
    const remaining = (ipConnections.get(remoteAddress) ?? 1) - 1;
    if (remaining > 0) ipConnections.set(remoteAddress, remaining);
    else ipConnections.delete(remoteAddress);
  };
  const acceptMessage = messageBudget();
  alive.add(ws);
  ws.on("pong", () => alive.add(ws));
  logger.info("WebSocket client connected");

  ws.on("message", (data) => {
    if (!acceptMessage(data instanceof ArrayBuffer ? data.byteLength :
      Array.isArray(data) ? data.reduce((sum, chunk) => sum + chunk.length, 0) : data.length)) {
      handleDisconnect(ws);
      ws.close(1008, "Message rate exceeded");
      return;
    }
    try { handleMessage(ws, data.toString()); }
    catch (err) {
      logger.error({ err }, "Rejected WebSocket handler failure");
      handleDisconnect(ws);
      ws.close(1011, "Message could not be processed");
    }
  });

  ws.on("close", () => {
    releaseConnection();
    handleDisconnect(ws);
    logger.info("WebSocket client disconnected");
  });

  ws.on("error", (err) => {
    logger.error({ err }, "WebSocket error");
  });
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
});
