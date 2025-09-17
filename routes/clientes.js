// routes/clientes.js
const express = require("express");
const router = express.Router();

const clientesController = require("../controllers/clientesController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

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
  clientesController.getClienteBasico
);

router.patch(
  "/:id/observacoes",
  autorizar("admin", "gerente"),
  clientesController.atualizarObservacoes
);

router.patch(
  "/:id",
  autorizar("admin", "gerente"),
  clientesController.atualizarCliente
);

router.delete("/:id", autorizar("admin"), clientesController.deletarCliente);

// utilitário
router.get(
  "/rotas/distintas",
  autorizar("admin", "gerente", "atendente"),
  clientesController.rotasDistintas
);

// ===== Padrão semanal e ajustes pontuais (admin/gerente) =====
router.get(
  "/padrao-semanal",
  autorizar("admin", "gerente"),
  clientesController.padraoSemanalTodos
);

router.get(
  "/:id/padrao-semanal",
  autorizar("admin", "gerente"),
  clientesController.padraoSemanalCliente
);

router.put(
  "/:id/padrao-semanal",
  autorizar("admin", "gerente"),
  clientesController.setPadraoSemanal
);

router.post(
  "/:id/ajuste-pontual",
  autorizar("admin", "gerente"),
  clientesController.registrarAjustePontual
);

router.get(
  "/:id/ajustes",
  autorizar("admin", "gerente"),
  clientesController.listarAjustesPontuais
);

// ===== Solicitação de alteração cadastral (vai para o admin) =====
router.post(
  "/:id/solicitar-alteracao",
  autorizar("gerente", "admin"),
  clientesController.solicitarAlteracao
);

module.exports = router;
