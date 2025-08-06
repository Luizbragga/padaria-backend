const express = require("express");
const router = express.Router();

const entregasController = require("../controllers/entregasController");
const estatisticasController = require("../controllers/estatisticasController");

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// 📦 CRUD básico
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.listarEntregas
);
router.post(
  "/",
  autenticar,
  autorizar("admin"),
  entregasController.criarEntrega
);
router.put(
  "/:id",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.atualizarEntrega
);
router.delete(
  "/:id",
  autenticar,
  autorizar("admin"),
  entregasController.deletarEntrega
);

// ✅ Concluir entrega (entregador)
router.put(
  "/:id/concluir",
  autenticar,
  autorizar("entregador"),
  entregasController.concluirEntrega
);

// 💸 Registrar pagamento
router.post(
  "/:id/registrar-pagamento",
  autenticar,
  autorizar("entregador", "gerente"),
  entregasController.registrarPagamento
);

// ❗ Relatar problema
router.post(
  "/:id/relatar-problema",
  autenticar,
  autorizar("entregador", "gerente"),
  entregasController.relatarProblema
);

// 📴 Desativar entrega
router.patch(
  "/:id/desativar",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.desativarEntrega
);

// ♻️ Reutilizar entrega
router.post(
  "/:id/reutilizar",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.reutilizarEntrega
);

// 📅 Entregas do dia (gerente)
router.get(
  "/hoje",
  autenticar,
  autorizar("gerente"),
  entregasController.listarEntregasDoDia
);

// 📊 Estatísticas
router.get("/estatisticas/total", entregasController.contarEntregas);
router.get(
  "/estatisticas/inadimplentes",
  entregasController.contarInadimplentes
);
router.get("/estatisticas/por-data", entregasController.contarPorData);
router.get("/estatisticas/por-cliente", entregasController.contarPorCliente);
router.get("/estatisticas/por-produto", entregasController.contarPorProduto);
router.get("/estatisticas/por-status", entregasController.contarPorStatus);

// 📈 Estatísticas avançadas (painel gerente)
router.get(
  "/estatisticas/gerente",
  autenticar,
  autorizar("gerente", "admin"),
  estatisticasController.estatisticasGerente
);

// 🛠️ Rota debug (visualizar todas as entregas rapidamente)
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
