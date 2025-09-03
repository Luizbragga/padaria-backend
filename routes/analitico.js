// routes/analitico.js
const express = require("express");
const router = express.Router();

const analitico = require("../controllers/analiticoController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// Autenticação para todas as rotas deste módulo
router.use(autenticar);

// Admin/Gerente por padrão
const podeVer = autorizar("admin", "gerente");

// === Mapeamento 1:1 com os exports do controller ===
router.get("/entregas-do-dia", podeVer, analitico.listarEntregasDoDia);
router.get("/entregas-por-dia", podeVer, analitico.entregasPorDia);
router.get("/inadimplencia", podeVer, analitico.inadimplencia);
router.get(
  "/produtos-mais-entregues",
  podeVer,
  analitico.produtosMaisEntregues
);
router.get(
  "/entregas-por-entregador",
  podeVer,
  analitico.entregasPorEntregador
);
router.get("/problemas-por-tipo", podeVer, analitico.problemasPorTipo);
router.get("/problemas-por-cliente", podeVer, analitico.problemasPorCliente);
router.get("/formas-de-pagamento", podeVer, analitico.formasDePagamento);
router.get("/clientes-por-mes", podeVer, analitico.clientesPorMes);
router.get(
  "/media-produtos-por-entrega",
  podeVer,
  analitico.mediaProdutosPorEntrega
);
router.get("/faturamento-mensal", podeVer, analitico.faturamentoMensal);
router.get("/resumo-financeiro", podeVer, analitico.resumoFinanceiro);

// Somente admin
router.get("/por-padaria", autorizar("admin"), analitico.entregasPorPadaria);

// Extras presentes no controller
router.get(
  "/entregas-por-dia-da-semana",
  podeVer,
  analitico.entregasPorDiaDaSemana
);
router.get(
  "/localizacao-entregadores",
  podeVer,
  analitico.obterLocalizacaoEntregadores
);
router.get("/entregas-tempo-real", podeVer, analitico.entregasTempoReal);
router.get("/pagamentos", podeVer, analitico.pagamentosDetalhados);
router.get("/notificacoes-recentes", podeVer, analitico.notificacoesRecentes);

module.exports = router;
