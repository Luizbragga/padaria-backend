const express = require("express");
const router = express.Router();
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// Rota protegida
router.get("/", autenticar, autorizar("admin", "gerente"), (req, res) => {
  res.json({
    msg: `Bem-vindo(a), ${req.usuario.role}! Acesso autorizado.`,
    usuario: req.usuario,
  });
});

module.exports = router;
