require("dotenv").config();

const express = require("express");
const app = express();

const logger = require("./logs/utils/logger");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const cron = require("node-cron");
const rateLimit = require("express-rate-limit");

// ===== Banco =====
const conectarBanco = require("./config/database");
conectarBanco();

// ===== CORS =====
const allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
};
app.use(cors(corsOptions));

// Preflight universal
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin || allowedOrigins[0]);
      res.header("Vary", "Origin");
      res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return res.sendStatus(204);
    }
  }
  next();
});

// ===== Middlewares =====
app.use(express.json());
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

// ===== CRON (opcional) =====
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

// ===== Rotas =====
app.get("/", (req, res) => res.send("Olá, Sistema de Entregas da Padaria!"));

app.use("/login", require("./routes/login"));
app.use("/token", require("./routes/tokens"));
app.use("/rotas-split", require("./routes/rotasSplitHoje"));
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/padarias", require("./routes/padarias"));
app.use("/produtos", require("./routes/produtos"));
app.use("/api/clientes", require("./routes/clientes")); // atenção: prefixo /api
app.use("/entregas", require("./routes/entregas"));
app.use("/entregas-avulsas", require("./routes/entregasAvulsas"));
app.use("/dev", require("./routes/dev"));
app.use("/rotas", require("./routes/rotas"));
app.use("/rota-entregador", require("./routes/rotaEntregador"));
app.use("/analitico", require("./routes/analitico"));
app.use("/config", require("./routes/config"));
app.use("/gerente", require("./routes/gerente"));
app.use("/admin", require("./routes/admin"));
app.use("/pagamentos", require("./routes/pagamentos"));
app.use("/caixa", require("./routes/caixa"));
app.use("/saldo-diario", require("./routes/saldoDiario"));
app.use("/teste-protegido", require("./routes/testeProtegido"));

// ===== 404 global (Express 5, sem coringa no path) =====
app.use((req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

// ===== Start =====
const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
  logger.info("Servidor iniciado");
});
