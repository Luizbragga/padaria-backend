// routes/clientes.js
const express = require("express");
const router = express.Router();

const { criarCliente } = require("../controllers/clientesController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// Apenas usuários AUTENTICADOS e com ROLE ADMIN podem criar cliente
router.post("/", autenticar, autorizar("admin"), criarCliente);

module.exports = router;
