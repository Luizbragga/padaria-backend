//index.js
require("dotenv-safe").config({
  example: ".env.example",
});

const express = require("express");
const app = express();
// sanitização global contra operadores perigosos do Mongo ($, .)
const sanitizeRequest = require("./middlewares/sanitizeRequest");
app.use(sanitizeRequest);

const cookieParser = require("cookie-parser");
const logger = require("./logs/utils/logger");
const helmet = require("helmet");
const hpp = require("hpp");
const morgan = require("morgan");
const cors = require("cors");
const cron = require("node-cron");
const rateLimit = require("express-rate-limit");
const blockMongoOperators = require("./middlewares/blockMongoOperators");

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
app.use(express.json({ limit: "1mb" }));
app.use(hpp());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("dev"));
app.use(blockMongoOperators());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    erro: "Muitas requisições vindas deste IP. Tente novamente mais tarde.",
  },
});
app.use(limiter);

// Limita cada IP a 5 tentativas de login a cada 15 minutos
// === Rate limit refinado por rota sensível ===
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20, // até 20 tentativas/15min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: "Muitas tentativas de login. Tente novamente em alguns minutos.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 60, // refresh deve ser mais permissivo que login, mas ainda controlado
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: "Excesso de solicitações de refresh. Aguarde alguns instantes.",
  },
});

// Aplica o limiter de login à rota de login (inclui POST /api/login)
app.use("/api/login", loginLimiter);

// Aplica o limiter de refresh às rotas de renovação de token
app.use("/api/login/token/refresh", refreshLimiter);
app.use("/api/token/refresh", refreshLimiter);

// timeout de app: encerra reqs que demoram demais a nível de app
app.use((req, res, next) => {
  // req/res têm setTimeout nativo no Node
  req.setTimeout(30_000); // 30s
  res.setTimeout(35_000); // 35s (um pouco > ao do req)
  next();
});

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

// aplicado rate limit **somente** nas rotas sensíveis
app.use("/api/login", loginLimiter, require("./routes/login"));
app.use("/api/token", refreshLimiter, require("./routes/tokens"));
app.use("/health", require("./routes/health"));
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

// injetar timeouts de segurança no servidor HTTP
const server = app.listen(PORT, () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
  logger.info("Servidor iniciado");
});

// Tempo máximo para processar uma requisição (após headers recebidos)
server.requestTimeout = 30_000; // 30s
// Tempo máximo aguardando headers da conexão
server.headersTimeout = 65_000; // 65s (deve ser > requestTimeout)
// Keep-alive para conexões reutilizáveis
server.keepAliveTimeout = 60_000; // 60s

/* ================================================= */
