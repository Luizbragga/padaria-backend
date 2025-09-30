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
