// routes/entregasAvulsas.js
const express = require("express");
const router = express.Router();

const controller = require("../controllers/entregasAvulsasController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const entregasController = require("../controllers/entregasController");
const Joi = require("joi");
const validate = require("../middlewares/validate");

// :id deve ser ObjectId válido (24 hex)
const objectIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

// aplica a validação em qualquer rota que comece com '/:id'
router.use("/:id", validate(objectIdParamSchema, "params"));

// Body de criação de entrega avulsa (sem mudar contrato do controller)
const criarEntregaAvulsaSchema = Joi.object({
  cliente: Joi.string().hex().length(24).required(),
  padaria: Joi.string().hex().length(24).required(),

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
    .max(500)
    .required(),

  data: Joi.alternatives()
    .try(Joi.string().isoDate(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
    .required(),

  rota: Joi.string().trim().max(50).optional(),

  enderecoEntrega: Joi.object({
    rua: Joi.string().max(200),
    numero: Joi.alternatives().try(Joi.string().max(20), Joi.number()),
    bairro: Joi.string().max(120),
    cidade: Joi.string().max(120),
    estado: Joi.string().max(60),
    cep: Joi.string().max(20),
    complemento: Joi.string().max(200),
  }).optional(),

  observacao: Joi.string().allow("").max(500).optional(),
}).required();

// Body para concluir entrega avulsa (todos opcionais; validar tipos se vierem)
const concluirAvulsaBodySchema = Joi.object({
  geo: Joi.object({ lat: Joi.number(), lng: Joi.number() }),
  comprovanteUrl: Joi.string().uri(),
  observacao: Joi.string().allow("").max(500),
}).unknown(true);

// Body para registrar pagamento (reusa estrutura usada em /entregas)
const registrarPagamentoBodySchema = Joi.object({
  valor: Joi.number().min(0),
  metodo: Joi.string().max(40),
  observacao: Joi.string().allow("").max(500),
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

// Query da listagem de entregas-avulsas (contrato preservado)
const listarEntregasAvulsasQuerySchema = Joi.object({
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
  cliente: Joi.string().hex().length(24),
  entregador: Joi.string().hex().length(24),
  rota: Joi.string().trim().max(50),

  // paginação/ordenação (opcionais; se o controller ignorar, não quebramos nada)
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().max(40),
  order: Joi.string().valid("asc", "desc"),

  // flags (0/1 ou boolean)
  incluirCanceladas: Joi.alternatives().try(
    Joi.number().valid(0, 1),
    Joi.boolean()
  ),
}).unknown(false); // bloqueia campos inesperados

// ======================= CRUD =======================

// Criar entrega avulsa (admin ou gerente)
router.post(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  validate(criarEntregaAvulsaSchema),
  controller.criarEntregaAvulsa
);

// Listar entregas avulsas da padaria (admin/gerente)
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  validate(listarEntregasAvulsasQuerySchema, "query"),
  controller.listarEntregasAvulsas
);

// Marcar como entregue (admin/gerente)
router.put(
  "/:id/concluir",
  autenticar,
  autorizar("admin", "gerente"),
  validate(concluirAvulsaBodySchema),
  controller.marcarComoEntregue
);

// Registrar pagamento (admin/gerente)
router.post(
  "/:id/registrar-pagamento",
  autenticar,
  autorizar("entregador", "gerente", "atendente", "admin"),
  validate(registrarPagamentoBodySchema),
  entregasController.registrarPagamento
);

// Deletar entrega avulsa (apenas admin)
router.delete(
  "/:id",
  autenticar,
  autorizar("admin"),
  controller.deletarEntregaAvulsa
);

module.exports = router;
