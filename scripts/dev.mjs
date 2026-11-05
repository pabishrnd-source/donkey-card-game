import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import net from "node:net";

const root = fileURLToPath(new URL("../", import.meta.url));
const frontendDir = path.join(root, "artifacts/card-game");
const backendDir = path.join(root, "artifacts/api-server");

const frontendPort = process.env.FRONTEND_PORT || "5173";
const backendPort = process.env.API_PORT || "3001";
const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

function run(args, cwd, env = {}, service = false) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping && (service || code)) stop(code ?? 1);
  });
  return child;
}

// Check both ports before starting either service so a failed start is obvious.
async function checkPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use. Set FRONTEND_PORT and API_PORT to unused ports.`,
        ),
      ),
    );
    server.listen(port, "0.0.0.0", () => server.close(resolve));
  });
}

try {
  if (frontendPort === backendPort)
    throw new Error("Frontend and API ports must differ.");
  await checkPort(frontendPort);
  await checkPort(backendPort);
  const frontendRequire = createRequire(path.join(frontendDir, "package.json"));
  const viteCli = path.join(
    path.dirname(frontendRequire.resolve("vite/package.json")),
    "bin/vite.js",
  );
  const build = run(["build.mjs"], backendDir);
  const exitCode = await new Promise((resolve, reject) => {
    build.once("exit", resolve);
    build.once("error", reject);
  });
  if (exitCode === 0 && !stopping) {
    run(
      ["--enable-source-maps", "dist/index.mjs"],
      backendDir,
      { PORT: backendPort },
      true,
    );
    run(
      [viteCli, "--config", "vite.config.ts"],
      frontendDir,
      {
        PORT: frontendPort,
        API_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
      },
      true,
    );
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
