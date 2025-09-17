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

// perfis
const podeVer = autorizar("admin", "gerente");
const podeVerLeve = autorizar("admin", "gerente", "atendente");

/**
 * Envolve um handler do controller:
 * - Se existir, devolve um wrapper async com catch -> next()
 * - Se NÃO existir, loga um aviso e devolve 501 (evita cair o servidor)
 */
function ensureFn(name) {
  const fn = analitico?.[name];
  if (typeof fn !== "function") {
    console.warn(
      `[analitico.routes] Handler "${name}" não é function (é ${typeof fn}). ` +
        `A rota ficará ativa com 501 Not Implemented até corrigir o export em controllers/analiticoController.js.`
    );
    return (_req, res) =>
      res
        .status(501)
        .json({ erro: `Handler "${name}" não implementado no controller.` });
  }
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** === Rotas === */

// A Receber (mensal, com cortes/pendências por mês anterior etc.)
router.get("/a-receber", podeVer, ensureFn("aReceberMensal"));

// Pendências (Atrasos)
router.get("/pendencias-anuais", podeVer, ensureFn("pendenciasAnuais"));
router.get("/pendencias-do-mes", podeVer, ensureFn("pendenciasDoMes"));

// Avulsas do mês
router.get("/avulsas", podeVer, ensureFn("avulsasDoMes"));

// Entregas / Analíticos diversos
router.get("/entregas-do-dia", podeVerLeve, ensureFn("listarEntregasDoDia"));
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
router.get("/resumo-financeiro", podeVerLeve, ensureFn("resumoFinanceiro"));

router.get("/por-padaria", autorizar("admin"), ensureFn("entregasPorPadaria"));

router.get(
  "/entregas-por-dia-da-semana",
  podeVer,
  ensureFn("entregasPorDiaDaSemana")
);
router.get(
  "/localizacao-entregadores",
  podeVer, // localização é sensível → sem atendente
  ensureFn("obterLocalizacaoEntregadores")
);
router.get("/entregas-tempo-real", podeVerLeve, ensureFn("entregasTempoReal"));

router.get("/pagamentos", podeVer, ensureFn("pagamentosDetalhados"));
router.get(
  "/notificacoes-recentes",
  podeVerLeve,
  ensureFn("notificacoesRecentes")
);

module.exports = router;
