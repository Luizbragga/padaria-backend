const express = require("express");
const router = express.Router();
const analiticoController = require("../controllers/analiticoController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// Rotas protegidas para admin e gerente
const autorizados = ["admin", "gerente"];

router.get(
  "/entregas-do-dia",
  autenticar,
  autorizar(...autorizados),
  analiticoController.listarEntregasDoDia
);
router.get(
  "/entregas-por-dia",
  autenticar,
  autorizar(...autorizados),
  analiticoController.entregasPorDia
);
router.get(
  "/inadimplencia",
  autenticar,
  autorizar(...autorizados),
  analiticoController.inadimplencia
);
router.get(
  "/produtos-mais-entregues",
  autenticar,
  autorizar(...autorizados),
  analiticoController.produtosMaisEntregues
);
router.get(
  "/entregas-por-entregador",
  autenticar,
  autorizar(...autorizados),
  analiticoController.entregasPorEntregador
);
router.get(
  "/problemas-por-tipo",
  autenticar,
  autorizar(...autorizados),
  analiticoController.problemasPorTipo
);
router.get(
  "/problemas-por-cliente",
  autenticar,
  autorizar(...autorizados),
  analiticoController.problemasPorCliente
);
router.get(
  "/formas-de-pagamento",
  autenticar,
  autorizar(...autorizados),
  analiticoController.formasDePagamento
);
router.get(
  "/clientes-por-mes",
  autenticar,
  autorizar(...autorizados),
  analiticoController.clientesPorMes
);
router.get(
  "/media-produtos-por-entrega",
  autenticar,
  autorizar(...autorizados),
  analiticoController.mediaProdutosPorEntrega
);
router.get(
  "/faturamento-mensal",
  autenticar,
  autorizar(...autorizados),
  analiticoController.faturamentoMensal
);
router.get(
  "/resumo-financeiro",
  autenticar,
  autorizar(...autorizados),
  analiticoController.resumoFinanceiro
);
router.get(
  "/por-padaria",
  autenticar,
  autorizar("admin"),
  analiticoController.entregasPorPadaria
);
router.get(
  "/entregas-por-dia-da-semana",
  autenticar,
  autorizar(...autorizados),
  analiticoController.entregasPorDiaDaSemana
);
router.get(
  "/localizacao-entregadores",
  autenticar,
  autorizar("admin", "gerente"),
  analiticoController.obterLocalizacaoEntregadores
);
router.get(
  "/previsao-entregas",
  autenticar,
  autorizar("admin", "gerente"),
  analiticoController.analisarPrevisaoEntregas
);
router.get(
  "/entregas-atrasadas",
  autenticar,
  autorizar("admin", "gerente"),
  analiticoController.listarEntregasAtrasadas
);
router.get(
  "/notificacoes-recentes",
  autenticar,
  autorizar("admin", "gerente"),
  analiticoController.notificacoesRecentes
);
router.get(
  "/entregas-tempo-real",
  autenticar,
  autorizar("admin", "gerente"),
  analiticoController.entregasTempoReal
);
router.get(
  "/pagamentos",
  autenticar,
  autorizar("admin", "gerente"),
  analiticoController.pagamentosDetalhados
);

module.exports = router;
