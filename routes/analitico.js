// routes/analitico.js
const express = require("express");
const router = express.Router();

const analitico = require("../controllers/analiticoController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// healthcheck (opcional)
router.get("/_ping", (req, res) => res.json({ ok: true }));

// todas as rotas daqui exigem autenticação
router.use(autenticar);

// admin ou gerente
const podeVer = autorizar("admin", "gerente");

// helper: garante que o handler é função e dá erro legível se não for
function ensureFn(name) {
  const fn = analitico[name];
  if (typeof fn !== "function") {
    throw new TypeError(
      `[analitico.routes] Handler "${name}" não é function (é ${typeof fn}).`
    );
  }
  return fn;
}

/** === Rotas === */
router.get("/a-receber", podeVer, ensureFn("aReceberMensal"));

router.get("/entregas-do-dia", podeVer, ensureFn("listarEntregasDoDia"));
router.get("/entregas-por-dia", podeVer, ensureFn("entregasPorDia"));
router.get("/inadimplencia", podeVer, ensureFn("inadimplencia"));
router.get(
  "/produtos-mais-entregues",
  podeVer,
  ensureFn("produtosMaisEntregues")
);
router.get(
  "/entregas-por-entregador",
  podeVer,
  ensureFn("entregasPorEntregador")
);
router.get("/problemas-por-tipo", podeVer, ensureFn("problemasPorTipo"));
router.get("/problemas-por-cliente", podeVer, ensureFn("problemasPorCliente"));
router.get("/formas-de-pagamento", podeVer, ensureFn("formasDePagamento"));
router.get("/clientes-por-mes", podeVer, ensureFn("clientesPorMes"));
router.get(
  "/media-produtos-por-entrega",
  podeVer,
  ensureFn("mediaProdutosPorEntrega")
);
router.get("/faturamento-mensal", podeVer, ensureFn("faturamentoMensal"));
router.get("/resumo-financeiro", podeVer, ensureFn("resumoFinanceiro"));

router.get("/por-padaria", autorizar("admin"), ensureFn("entregasPorPadaria"));

router.get(
  "/entregas-por-dia-da-semana",
  podeVer,
  ensureFn("entregasPorDiaDaSemana")
);
router.get(
  "/localizacao-entregadores",
  podeVer,
  ensureFn("obterLocalizacaoEntregadores")
);
router.get("/entregas-tempo-real", podeVer, ensureFn("entregasTempoReal"));
router.get("/pagamentos", podeVer, ensureFn("pagamentosDetalhados"));
router.get("/notificacoes-recentes", podeVer, ensureFn("notificacoesRecentes"));

// Só mantenha esta se o controller tiver mesmo o handler:
/// router.get("/avulsas", podeVer, ensureFn("avulsasDoMes"));

module.exports = router;
