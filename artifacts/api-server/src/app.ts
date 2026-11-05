import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authRouter } from "./lib/accounts.js";

const app: Express = express();

const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "capacitor://localhost",
  "https://localhost",
  ...configuredOrigins,
]);

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin(origin, callback) {
    // Native clients may omit Origin. Browser clients must be explicitly allowed.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api/auth", authRouter);

export default app;
