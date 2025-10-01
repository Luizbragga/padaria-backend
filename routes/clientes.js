// routes/clientes.js
const express = require("express");
const router = express.Router();

const clientesController = require("../controllers/clientesController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// === validação de params :id ===
const Joi = require("joi");
const validate = require("../middlewares/validate");

// Body de atualização parcial de cliente (ao menos 1 campo)
const clienteUpdateSchema = Joi.object({
  nome: Joi.string().min(1).max(200),
  telefone: Joi.string().max(40),
  email: Joi.string().email(),
  endereco: Joi.object({
    rua: Joi.string().max(200),
    numero: Joi.alternatives().try(Joi.string().max(20), Joi.number()),
    bairro: Joi.string().max(120),
    cidade: Joi.string().max(120),
    estado: Joi.string().max(60),
    cep: Joi.string().max(20),
    complemento: Joi.string().max(200),
  }),
  rota: Joi.string().max(120),
  padaria: Joi.string().hex().length(24),
  ativo: Joi.boolean(),
  // Observações gerais têm rota própria; aqui mantemos generico se o controller aceitar silenciosamente
  observacoes: Joi.string().max(5000),
}).min(1);

const objectIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

// Body para atualizar observações (texto simples, limite de tamanho)
const clienteObservacoesSchema = Joi.object({
  observacoes: Joi.string().allow("").max(5000).required(),
});

// Body do padrão semanal: 7 dias (0..6), cada dia com array de itens (produtoId, qtd>0)
const padraoSemanalSchema = Joi.object({
  dias: Joi.object()
    .pattern(
      Joi.string().regex(/^[0-6]$/), // chaves "0" a "6"
      Joi.array()
        .items(
          Joi.object({
            produtoId: Joi.string().hex().length(24).required(),
            quantidade: Joi.number().integer().min(1).required(),
            observacao: Joi.string().max(300).optional(),
          })
        )
        .max(200) // limite pragmático por dia
        .required()
    )
    .required(),
}).required();

// Body do ajuste pontual: data (ISO/YYY-MM-DD), itens com produtoId e quantidade (pode reduzir/incrementar)
const ajustePontualSchema = Joi.object({
  data: Joi.alternatives()
    .try(Joi.string().isoDate(), Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
    .required(),
  itens: Joi.array()
    .items(
      Joi.object({
        produtoId: Joi.string().hex().length(24).required(),
        quantidade: Joi.number().integer().min(-9999).max(9999).required(), // permite negativo para reduzir
        observacao: Joi.string().max(300).optional(),
      })
    )
    .min(1)
    .max(500) // limite pragmático
    .required(),
  motivo: Joi.string().max(300).optional(),
}).required();

// todas as rotas de clientes exigem usuário autenticado
router.use(autenticar);

// ===== CRUD básico =====
router.post("/", autorizar("admin"), clientesController.criarCliente);

router.get(
  "/",
  autorizar("admin", "gerente", "atendente"),
  clientesController.listarClientes
);

router.get(
  "/:id/basico",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
  clientesController.getClienteBasico
);

router.patch(
  "/:id/observacoes",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
  validate(clienteObservacoesSchema),
  clientesController.atualizarObservacoes
);

router.patch(
  "/:id",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
  validate(clienteUpdateSchema),
  clientesController.atualizarCliente
);

router.delete(
  "/:id",
  autorizar("admin"),
  validate(objectIdParamSchema, "params"),
  clientesController.deletarCliente
);

// utilitário
router.get(
  "/rotas/distintas",
  autorizar("admin", "gerente", "atendente"),
  clientesController.rotasDistintas
);

// ===== Padrão semanal e ajustes pontuais (admin/gerente) =====
router.get(
  "/:id/padrao-semanal",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
  clientesController.padraoSemanalCliente
);

router.put(
  "/:id/padrao-semanal",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
  validate(padraoSemanalSchema),
  clientesController.setPadraoSemanal
);

router.post(
  "/:id/ajuste-pontual",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
  validate(ajustePontualSchema),
  clientesController.registrarAjustePontual
);

router.get(
  "/:id/ajustes",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
  clientesController.listarAjustesPontuais
);

// ===== Solicitação de alteração cadastral (vai para o admin) =====
router.post(
  "/:id/solicitar-alteracao",
  autorizar("gerente", "admin"),
  validate(objectIdParamSchema, "params"),
  clientesController.solicitarAlteracao
);

router.get(
  "/padrao-semanal",
  autorizar("admin", "gerente"),
  clientesController.padraoSemanalTodos
);

module.exports = router;
