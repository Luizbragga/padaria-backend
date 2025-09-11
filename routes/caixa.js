// routes/caixa.js
const express = require("express");
const router = express.Router();

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Cliente = require("../models/Cliente");

router.get(
  "/clientes",
  autenticar,
  autorizar("gerente", "atendente"), // gerente e atendente podem consultar
  async (req, res) => {
    try {
      const padariaId = req.usuario?.padaria;
      if (!padariaId) {
        return res.status(400).json({ erro: "Usuário sem padaria vinculada." });
      }

      const q = String(req.query.q || "").trim();
      const limite = Math.min(Number(req.query.limite) || 100, 500);

      const filtro = { padaria: padariaId };
      if (q) {
        filtro.$or = [
          { nome: { $regex: q, $options: "i" } },
          { rota: { $regex: q, $options: "i" } },
          { endereco: { $regex: q, $options: "i" } },
        ];
      }

      const clientes = await Cliente.find(filtro)
        .select("_id nome rota endereco")
        .sort({ nome: 1 })
        .limit(limite)
        .lean();

      res.json({ clientes });
    } catch (e) {
      console.error("caixa/clientes:", e);
      res.status(500).json({ erro: "Falha ao buscar clientes." });
    }
  }
);

module.exports = router;
