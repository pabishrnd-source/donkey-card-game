import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { handleMessage, handleDisconnect } from "./lib/gameManager.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Create an HTTP server that wraps Express, so we can attach the WebSocket server
const server = http.createServer(app);

// WebSocket server attached to the same HTTP server
// The client connects to /ws path
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: WebSocket) => {
  logger.info("WebSocket client connected");

  ws.on("message", (data) => {
    handleMessage(ws, data.toString());
  });

  ws.on("close", () => {
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
