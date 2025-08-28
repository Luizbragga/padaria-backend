// routes/produtos.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/produtosController");

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// Criar produto (apenas admin)
router.post("/", autenticar, autorizar("admin"), controller.criarProduto);

// Listar produtos (admin ou gerente)
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  controller.listarProdutos
);

module.exports = router;
