// >>> em routes/clientes.js
const express = require("express");
const router = express.Router();

const clientesController = require("../controllers/clientesController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// já deve existir algo assim...
router.use(autenticar);

// NOVO: padrão semanal de UM cliente
router.get(
  "/:id/padrao-semanal",
  autorizar("admin", "gerente"),
  clientesController.padraoSemanalCliente
);

// NOVO: padrão semanal de TODOS os clientes da padaria
router.get(
  "/padrao-semanal",
  autorizar("admin", "gerente"),
  clientesController.padraoSemanalTodos
);

module.exports = router;
