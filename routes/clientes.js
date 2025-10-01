// routes/clientes.js
const express = require("express");
const router = express.Router();

const clientesController = require("../controllers/clientesController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// === validação de params :id ===
const Joi = require("joi");
const validate = require("../middlewares/validate");

const objectIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

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
  clientesController.atualizarObservacoes
);

router.patch(
  "/:id",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
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
  clientesController.setPadraoSemanal
);

router.post(
  "/:id/ajuste-pontual",
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
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
