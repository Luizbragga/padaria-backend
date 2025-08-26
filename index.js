require("dotenv").config();
const express = require("express");
const logger = require("./logs/utils/logger");
const app = express();
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const cron = require("node-cron");

const { gerarEntregasDoDia } = require("./controllers/gerarEntregasDiarias"); // ✅ apenas uma vez
// 🔹 Execução automática diária às 00:00
cron.schedule("0 0 * * *", () => {
  console.log(
    `[${new Date().toISOString()}] Iniciando geração automática das entregas do dia...`
  );
  gerarEntregasDoDia();
});

logger.info("Servidor iniciado");
logger.error("Teste de erro");

// -------- CORS (Express 5, sem app.options) --------
const corsOptions = {
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false, // você guarda tokens no localStorage, não usa cookies
  maxAge: 600,
};
app.use(cors(corsOptions));
// responde a qualquer preflight logo aqui
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
// ---------------------------------------------------

app.use(morgan("dev"));
app.use(helmet());
app.use(express.json()); // ESSENCIAL p/ POST/PUT JSON

// 3) Só depois o rate limit
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    erro: "Muitas requisições vindas deste IP. Tente novamente mais tarde.",
  },
});
app.use(limiter);

const conectarBanco = require("./config/database");
conectarBanco();
gerarEntregasDoDia(); // chamada manual forçada

const entregasRoutes = require("./routes/entregas");
app.use("/entregas", entregasRoutes);

app.get("/", (req, res) => {
  res.send("Olá, Sistema de Entregas da Padaria!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
});

const login = require("./routes/login");
app.use("/login", login);

const testeProtegido = require("./routes/testeProtegido");
app.use("/teste-protegido", testeProtegido);

const usuarios = require("./routes/usuarios");
app.use("/usuarios", usuarios);

const rotaEntregador = require("./routes/rotaEntregador");
app.use("/rota-entregador", rotaEntregador);

const gerenteRoutes = require("./routes/gerente");
app.use("/gerente", gerenteRoutes);

const rotasPadarias = require("./routes/padarias");
app.use("/padarias", rotasPadarias);

const adminRoutes = require("./routes/admin");
app.use("/admin", adminRoutes);

const tokenRoutes = require("./routes/tokens");
app.use("/token", tokenRoutes);

const analiticoRoutes = require("./routes/analitico");
app.use("/analitico", analiticoRoutes);

const clientesRoutes = require("./routes/clientes");
app.use("/api/clientes", clientesRoutes);

const entregasAvulsasRoutes = require("./routes/entregasAvulsas");
app.use("/entregas-avulsas", entregasAvulsasRoutes);

const produtosRoutes = require("./routes/produtos");
app.use("/produtos", produtosRoutes);

const rotasRoutes = require("./routes/rotas");
app.use("/rotas", rotasRoutes);
