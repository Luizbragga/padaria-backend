//index.js
require("dotenv").config();

const express = require("express");
const app = express();

const cookieParser = require("cookie-parser");
const logger = require("./logs/utils/logger");
const helmet = require("helmet");
const hpp = require("hpp");
const morgan = require("morgan");
const cors = require("cors");
const cron = require("node-cron");
const rateLimit = require("express-rate-limit");

/* ===== Banco ===== */
const conectarBanco = require("./config/database");
conectarBanco();

/* =========== CORS: montar allowlist via .env =========== */
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : [];

const corsOptions = {
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Origin não permitida por CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "ngrok-skip-browser-warning",
  ],
  credentials: true,
  optionsSuccessStatus: 204,
};
/* ======================================================= */

/* =============== Middlewares (ordem importa) ============ */
app.use(cookieParser());
app.use(express.json());
app.use(hpp());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("dev"));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    erro: "Muitas requisições vindas deste IP. Tente novamente mais tarde.",
  },
});
app.use(limiter);
// === Rate limiting específico ===
// Limita cada IP a 5 tentativas de login a cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: {
    erro: "Muitas tentativas de login. Tente novamente mais tarde.",
  },
});

// Limita requisições de refresh token (aplicado às rotas de refresh) a 100 por IP em 15 minutos
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    erro: "Muitas requisições de token. Tente novamente mais tarde.",
  },
});

// Aplica o limiter de login à rota de login (inclui POST /api/login)
app.use("/api/login", loginLimiter);

// Aplica o limiter de refresh às rotas de renovação de token
app.use("/api/login/token/refresh", refreshLimiter);
app.use("/api/token/refresh", refreshLimiter);

/* ======================= CRON ==================== */
let gerarEntregasDoDia = null;
try {
  ({ gerarEntregasDoDia } = require("./controllers/gerarEntregasDiarias"));
} catch {
  logger.warn(
    "Controller gerarEntregasDiarias não encontrado. CRON ficará inativo."
  );
}
if (typeof gerarEntregasDoDia === "function") {
  cron.schedule("0 0 * * *", () => {
    try {
      logger.info(
        `[${new Date().toISOString()}] Disparando geração automática das entregas do dia...`
      );
      Promise.resolve(gerarEntregasDoDia()).catch((e) =>
        logger.error("Erro no CRON gerarEntregasDoDia:", e)
      );
    } catch (e) {
      logger.error("Falha ao agendar job do CRON:", e);
    }
  });

  Promise.resolve(gerarEntregasDoDia()).catch((e) =>
    logger.error("Erro ao gerar entregas no boot:", e)
  );
}
/* ================================================= */

/* ======================= Rotas =================== */
app.get("/", (_req, res) => res.send("Olá, Sistema de Entregas da Padaria!"));
// === Preflight CORS mais permissivo (cole ANTES das rotas) ===
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    const reqHeaders = req.headers["access-control-request-headers"];
    res.header(
      "Access-Control-Allow-Headers",
      reqHeaders || "Authorization, Content-Type, ngrok-skip-browser-warning"
    );
    // como usamos cookie httpOnly, habilite credenciais no preflight
    res.header("Access-Control-Allow-Credentials", "true");
    return res.sendStatus(204);
  }

  next();
});

app.use("/api/login", require("./routes/login"));
app.use("/api/token", require("./routes/tokens"));
app.use("/api/rotas-split", require("./routes/rotasSplitHoje"));
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/api/padarias", require("./routes/padarias"));
app.use("/api/produtos", require("./routes/produtos"));
app.use("/api/clientes", require("./routes/clientes"));
app.use("/api/entregas", require("./routes/entregas"));
app.use("/api/entregas-avulsas", require("./routes/entregasAvulsas"));
app.use("/api/dev", require("./routes/dev"));
app.use("/api/rotas", require("./routes/rotas"));
app.use("/api/rota-entregador", require("./routes/rotaEntregador"));
app.use("/api/analitico", (req, _res, next) => {
  console.log("[ANALITICO HIT]", req.method, req.path);
  next();
});
app.use("/api/analitico", require("./routes/analitico"));
app.use("/api/config", require("./routes/config"));
app.use("/api/gerente", require("./routes/gerente"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/pagamentos", require("./routes/pagamentos"));
app.use("/api/caixa", require("./routes/caixa"));
app.use("/api/saldo-diario", require("./routes/saldoDiario"));
app.use("/api/teste-protegido", require("./routes/testeProtegido"));

// Middleware de erro (deve estar antes do 404)
const errorHandler = require("./middlewares/errorHandler");
app.use(errorHandler);

/* ======================= 404 ===================== */
app.use((_req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});
/* ================================================= */

/* ======================= Start =================== */
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
  logger.info("Servidor iniciado");
});
/* ================================================= */
