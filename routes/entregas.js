// routes/entregas.js
const express = require("express");
const router = express.Router();
const entregasController = require("../controllers/entregasController");
const estatisticasController = require("../controllers/estatisticasController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Joi = require("joi");
const validate = require("../middlewares/validate");

const objectIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

router.use("/:id", validate(objectIdParamSchema, "params"));

// Query da listagem de entregas: filtros e paginação (contrato preservado)
const listarEntregasQuerySchema = Joi.object({
  // filtros opcionais
  dataInicial: Joi.alternatives().try(
    Joi.string().isoDate(),
    Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)
  ),
  dataFinal: Joi.alternatives().try(
    Joi.string().isoDate(),
    Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)
  ),
  padaria: Joi.string().hex().length(24),
  cliente: Joi.string().hex().length(24), // se o seu contrato usa id de cliente
  entregador: Joi.string().hex().length(24), // idem
  rota: Joi.string().trim().max(50),
  status: Joi.string()
    .valid("pendente", "em_rota", "finalizada", "cancelada")
    .insensitive(), // se existir no seu back; se não houver, podemos remover depois

  // paginação/ordenação (opcionais)
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid("data", "rota", "status", "createdAt", "updatedAt"),
  order: Joi.string().valid("asc", "desc"),

  // flags (0/1 ou boolean)
  incluirCanceladas: Joi.alternatives().try(
    Joi.number().valid(0, 1),
    Joi.boolean()
  ),
}).unknown(false); // bloqueia campos inesperados

// Body parcial para atualizar entrega (PUT /:id)
// ✓ exige ao menos 1 campo conhecido, mas permite extras (unknown true) p/ não quebrar contrato
const atualizarEntregaBodySchema = Joi.object({
  rota: Joi.string().trim().max(50),
  observacao: Joi.string().allow("").max(500),
  data: Joi.alternatives().try(
    Joi.string().isoDate(),
    Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)
  ),
  status: Joi.string().max(40),
  itens: Joi.array()
    .items(
      Joi.object({
        produtoId: Joi.string().hex().length(24).required(),
        quantidade: Joi.number().integer().min(1).required(),
        precoUnitario: Joi.number().min(0).optional(),
        observacao: Joi.string().max(300).optional(),
      })
    )
    .min(1)
    .max(500),
})
  .min(1)
  .unknown(true);

// Body para concluir entrega (PUT /:id/concluir)
// Todos opcionais; validamos tipos se vierem
const concluirEntregaBodySchema = Joi.object({
  geo: Joi.object({ lat: Joi.number(), lng: Joi.number() }),
  comprovanteUrl: Joi.string().uri(),
  observacao: Joi.string().allow("").max(500),
}).unknown(true);

// Body para registrar pagamento (POST /:id/registrar-pagamento)
// Pelo menos um campo relevante; validamos 'valor' se vier
const registrarPagamentoBodySchema = Joi.object({
  valor: Joi.number().min(0),
  metodo: Joi.string().max(40), // ex: dinheiro, pix, cartão...
  observacao: Joi.string().allow("").max(500),
  // suportar granularidade por item se já existir no controller:
  itens: Joi.array()
    .items(
      Joi.object({
        produtoId: Joi.string().hex().length(24).required(),
        valor: Joi.number().min(0).required(),
      })
    )
    .min(1),
})
  .min(1)
  .unknown(true);

// Body para relatar problema (POST /:id/relatar-problema)
// Pelo menos 'tipo' ou 'descricao'
const relatarProblemaBodySchema = Joi.object({
  tipo: Joi.string().trim().max(100),
  descricao: Joi.string().trim().max(500),
  fotoUrl: Joi.string().uri(),
})
  .or("tipo", "descricao")
  .unknown(true);

// ======================= CRUD =======================
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente", "entregador"),
  validate(listarEntregasQuerySchema, "query"), // valida/sanitiza query
  entregasController.listarEntregas
);

// criação manual de entrega individual — mantido comentado
// router.post(
//   "/",
//   autenticar,
//   autorizar("admin"),
//   entregasController.criarEntrega
// );

router.put(
  "/:id",
  autenticar,
  autorizar("admin", "gerente"),
  validate(atualizarEntregaBodySchema),
  entregasController.atualizarEntrega
);

// ======================= Entregador =======================

// Lista SOMENTE as entregas do entregador logado (usado em /entregas/minhas do frontend)
router.get(
  "/minhas",
  autenticar,
  autorizar("entregador"),
  entregasController.listarMinhasEntregas
);

// Concluir entrega
router.put(
  "/:id/concluir",
  autenticar,
  autorizar("entregador"),
  validate(concluirEntregaBodySchema),
  entregasController.concluirEntrega
);

// Registrar pagamento (entregador e gerente podem)
router.post(
  "/:id/registrar-pagamento",
  autenticar,
  autorizar("entregador", "gerente", "atendente", "admin"),
  validate(registrarPagamentoBodySchema),
  entregasController.registrarPagamento
);

// Relatar problema
router.post(
  "/:id/relatar-problema",
  autenticar,
  autorizar("entregador", "gerente"),
  validate(relatarProblemaBodySchema),
  entregasController.relatarProblema
);

// =======================
// 📴 Administração da entrega
// =======================

router.patch(
  "/:id/desativar",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.desativarEntrega
);

router.post(
  "/:id/reutilizar",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.reutilizarEntrega
);

// =======================
// 📅 Gerente
// =======================
router.get(
  "/hoje",
  autenticar,
  autorizar("gerente"),
  entregasController.listarEntregasDoDia
);

// =======================
// 📊 Estatísticas
// =======================

// (se quiser manter públicos, pode remover os middlewares destes 5 abaixo)
router.get(
  "/estatisticas/total",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.contarEntregas
);

router.get(
  "/estatisticas/inadimplentes",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.contarInadimplentes
);

router.get(
  "/estatisticas/por-data",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.contarPorData
);

router.get(
  "/estatisticas/por-cliente",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.contarPorCliente
);

router.get(
  "/estatisticas/por-produto",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.contarPorProduto
);

router.get(
  "/estatisticas/por-status",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.contarPorStatus
);

// Estatísticas avançadas (painel do gerente)
router.get(
  "/estatisticas/gerente",
  autenticar,
  autorizar("gerente", "admin"),
  estatisticasController.estatisticasGerente
);

// =======================
// 🛠️ Rota debug (opcional | não-produção)
// =======================
router.get("/debug/todas", async (req, res) => {
  const Entrega = require("../models/Entrega");
  try {
    const entregas = await Entrega.find().sort({ createdAt: -1 });
    res.json(
      entregas.map((e) => ({
        id: e._id,
        cliente: e.cliente,
        ativa: e.ativa,
        createdAt: e.createdAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

module.exports = router;
