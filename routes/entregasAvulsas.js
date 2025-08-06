const express = require("express");
const router = express.Router();

const controller = require("../controllers/entregasAvulsasController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// Criar entrega avulsa (admin ou gerente)
router.post(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  controller.criarEntregaAvulsa
);

// Listar entregas avulsas da padaria
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  controller.listarEntregasAvulsas
);

// Marcar como entregue
router.put(
  "/:id/concluir",
  autenticar,
  autorizar("admin", "gerente"),
  controller.marcarComoEntregue
);

// Registrar pagamento
router.post(
  "/:id/registrar-pagamento",
  autenticar,
  autorizar("admin", "gerente"),
  controller.registrarPagamento
);

// Deletar entrega avulsa
router.delete(
  "/:id",
  autenticar,
  autorizar("admin"),
  controller.deletarEntregaAvulsa
);

module.exports = router;
