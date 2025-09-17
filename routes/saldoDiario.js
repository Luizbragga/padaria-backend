const express = require("express");
const router = express.Router();

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const ctrl = require("../controllers/saldoDiarioController");

// todas exigem usuário autenticado
router.use(autenticar);

// admin e gerente podem usar
router.get("/saldo", autorizar("admin", "gerente"), ctrl.getSaldo);
router.post("/lote", autorizar("admin", "gerente"), ctrl.criarLote);
router.post("/vender", autorizar("admin", "gerente"), ctrl.registrarVenda);

module.exports = router;
