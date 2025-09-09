// routes/clientes.js
const express = require("express");
const router = express.Router();

const clientesController = require("../controllers/clientesController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// todas as rotas de clientes exigem usuário autenticado
router.use(autenticar);

/** Coleção: padrão semanal de TODOS os clientes da padaria */
router.get(
  "/padrao-semanal",
  autorizar("admin", "gerente"),
  clientesController.padraoSemanalTodos
);

/** Item: padrão semanal de UM cliente */
router.get(
  "/:id/padrao-semanal",
  autorizar("admin", "gerente"),
  clientesController.padraoSemanalCliente
);

/** Ficha básica (para o modal do gerente) */
router.get(
  "/:id/basico",
  autorizar("admin", "gerente"),
  clientesController.getClienteBasico
);

/** Atualizar apenas observações */
router.patch(
  "/:id/observacoes",
  autorizar("admin", "gerente"),
  clientesController.atualizarObservacoes
);

/** Atualização geral de dados básicos (endereço, telefone, rota...) */
router.patch(
  "/:id",
  autorizar("admin", "gerente"),
  clientesController.atualizarCliente
);

/** (Opcional) Fallback de GET /clientes/:id -> devolve a ficha básica
 *  Isso ajuda o front caso ele chame /:id direto.
 */
router.get(
  "/:id",
  autorizar("admin", "gerente"),
  clientesController.getClienteBasico
);
// Listar clientes (admin ou gerente) — aceita ?padaria=<id>&rota=A&busca=...
router.get(
  "/",
  autorizar("admin", "gerente"),
  clientesController.listarClientes
);

module.exports = router;
