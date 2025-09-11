// routes/entregasAvulsas.js
const express = require("express");
const router = express.Router();

const controller = require("../controllers/entregasAvulsasController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const entregasController = require("../controllers/entregasController");

// ✅ Criar entrega avulsa (admin ou gerente)
router.post(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  controller.criarEntregaAvulsa
);

// 📄 Listar entregas avulsas da padaria (admin/gerente)
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  controller.listarEntregasAvulsas
);

// ✅ Marcar como entregue (admin/gerente)
router.put(
  "/:id/concluir",
  autenticar,
  autorizar("admin", "gerente"),
  controller.marcarComoEntregue
);

// 💸 Registrar pagamento (admin/gerente)
router.post(
  "/:id/registrar-pagamento",
  autenticar,
  autorizar("entregador", "gerente", "atendente", "admin"),
  entregasController.registrarPagamento
);

// 🗑️ Deletar entrega avulsa (apenas admin)
router.delete(
  "/:id",
  autenticar,
  autorizar("admin"),
  controller.deletarEntregaAvulsa
);

module.exports = router;
