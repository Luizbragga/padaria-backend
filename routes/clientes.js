const express = require("express");
const router = express.Router();
const { criarCliente } = require("../controllers/clientesController");
const autenticar = require("../middlewares/autenticacao");

router.post("/", autenticar, criarCliente);

module.exports = router;
