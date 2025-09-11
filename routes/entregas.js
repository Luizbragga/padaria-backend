// routes/entregas.js
const express = require("express");
const router = express.Router();

const entregasController = require("../controllers/entregasController");
const estatisticasController = require("../controllers/estatisticasController");

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// =======================
// 📦 CRUD / Operações base
// =======================
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  entregasController.listarEntregas
);

// (opcional) criação manual de entrega individual — mantido comentado
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
  entregasController.atualizarEntrega
);

router.delete(
  "/:id",
  autenticar,
  autorizar("admin"),
  entregasController.deletarEntrega
);

// =======================
// 👤 Entregador
// =======================

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
  entregasController.concluirEntrega
);

// Registrar pagamento (entregador e gerente podem)
router.post(
  "/:id/registrar-pagamento",
  autenticar,
  autorizar("entregador", "gerente", "atendente", "admin"),
  entregasController.registrarPagamento
);

// Relatar problema
router.post(
  "/:id/relatar-problema",
  autenticar,
  autorizar("entregador", "gerente"),
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
