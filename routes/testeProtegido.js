// routes/testeProtegido.js
const express = require("express");
const router = express.Router();

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// ping público simples (opcional)
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "teste-protegido",
    ts: new Date().toISOString(),
  });
});

// ver dados do token sem precisar de role específica
router.get("/me", autenticar, (req, res) => {
  res.json({
    ok: true,
    mensagem: "Token válido.",
    usuario: req.usuario, // { id, role, padaria? }
    ts: new Date().toISOString(),
  });
});

// rota realmente protegida por role (admin OU gerente)
router.get("/", autenticar, autorizar("admin", "gerente"), (req, res) => {
  const { role, padaria, id } = req.usuario || {};
  res.json({
    ok: true,
    mensagem: `Bem-vindo(a), ${role}! Acesso autorizado.`,
    usuario: { id, role, padaria: padaria || null },
    ts: new Date().toISOString(),
  });
});

// fallback para métodos não permitidos
router.all("/", (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }
  return res.status(404).json({ erro: "Rota não encontrada" });
});

module.exports = router;
