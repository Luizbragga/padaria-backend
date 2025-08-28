const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Padaria = require("../models/Padaria");
const Usuario = require("../models/Usuario");
const Entrega = require("../models/Entrega");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Joi = require("joi");

/* =========================
   GET /admin/painel  (admin)
   Painel consolidado por padaria
   ========================= */
router.get("/painel", autenticar, autorizar("admin"), async (req, res) => {
  try {
    const padarias = await Padaria.find({ ativa: true })
      .select("_id nome cidade estado")
      .lean();

    if (!padarias.length) return res.json([]);

    // Mapa para lookup rápido
    const idsPadarias = padarias.map((p) => p._id);

    // Agrega entregas por padaria (total, pagas, inadimplentes) em UMA query
    const agregados = await Entrega.aggregate([
      { $match: { padaria: { $in: idsPadarias } } },
      {
        $group: {
          _id: "$padaria",
          totalEntregas: { $sum: 1 },
          entregasPagas: {
            $sum: { $cond: [{ $eq: ["$pago", true] }, 1, 0] },
          },
          inadimplentes: {
            $sum: { $cond: [{ $eq: ["$pago", false] }, 1, 0] },
          },
        },
      },
    ]);

    const mapaAgregado = new Map(
      agregados.map((a) => [
        String(a._id),
        {
          totalEntregas: a.totalEntregas || 0,
          entregasPagas: a.entregasPagas || 0,
          inadimplentes: a.inadimplentes || 0,
        },
      ])
    );

    // Busca usuários de cada padaria (1 query por padaria para manter simples)
    const painel = await Promise.all(
      padarias.map(async (p) => {
        const usuarios = await Usuario.find({ padaria: p._id })
          .select("nome email role")
          .lean();

        const stats = mapaAgregado.get(String(p._id)) || {
          totalEntregas: 0,
          entregasPagas: 0,
          inadimplentes: 0,
        };

        return {
          id: p._id,
          nome: p.nome,
          cidade: p.cidade,
          estado: p.estado,
          usuarios,
          ...stats,
        };
      })
    );

    res.json(painel);
  } catch (error) {
    console.error("Erro /admin/painel:", error);
    res.status(500).json({ erro: "Erro ao gerar painel do admin" });
  }
});

/* =========================
   PUT /admin/usuarios/:id  (admin)
   Atualizar dados do usuário
   ========================= */

const usuarioAtualizacaoSchema = Joi.object({
  nome: Joi.string().trim().min(2).max(120).optional(),
  email: Joi.string().email().allow("", null).optional(),
  role: Joi.string().valid("entregador", "gerente", "admin").optional(),
  padaria: Joi.string().allow(null, "").optional(), // validamos relação role↔padaria abaixo
});

router.put(
  "/usuarios/:id",
  autenticar,
  autorizar("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ erro: "ID de usuário inválido." });
      }

      // valida payload
      const { error, value } = usuarioAtualizacaoSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ erro: error.details[0].message });
      }

      const update = { ...value };

      // Regra: admin não precisa de padaria; gerente/entregador precisam
      if (update.role) {
        if (update.role === "admin") {
          update.padaria = null; // garante que admin não fique preso a uma padaria
        } else {
          const alvoPadaria = update.padaria;
          if (!alvoPadaria || !mongoose.Types.ObjectId.isValid(alvoPadaria)) {
            return res.status(400).json({
              erro: "Para gerente/entregador é obrigatório informar uma padaria válida.",
            });
          }
        }
      }

      // Se vier padaria isoladamente (sem mudar role), só valida se for não-vazia
      if (update.padaria && !mongoose.Types.ObjectId.isValid(update.padaria)) {
        return res.status(400).json({ erro: "Padaria inválida." });
      }

      const usuarioAtualizado = await Usuario.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      })
        .select("-senha")
        .lean();

      if (!usuarioAtualizado) {
        return res.status(404).json({ erro: "Usuário não encontrado." });
      }

      res.json(usuarioAtualizado);
    } catch (err) {
      // duplicate key (ex.: nome único, email se você definir unique, etc.)
      if (err && err.code === 11000) {
        const campo = Object.keys(err.keyPattern || {})[0] || "campo";
        return res
          .status(400)
          .json({ erro: `Valor já cadastrado para ${campo}.` });
      }
      console.error("Erro ao atualizar usuário:", err);
      res.status(500).json({ erro: "Erro ao atualizar usuário." });
    }
  }
);

/* =========================
   DELETE /admin/usuarios/:id  (admin)
   Remover usuário
   ========================= */
router.delete(
  "/usuarios/:id",
  autenticar,
  autorizar("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ erro: "ID de usuário inválido." });
      }

      const usuarioRemovido = await Usuario.findByIdAndDelete(id).lean();

      if (!usuarioRemovido) {
        return res.status(404).json({ erro: "Usuário não encontrado." });
      }

      res.json({
        mensagem: "Usuário removido com sucesso.",
        usuario: usuarioRemovido,
      });
    } catch (err) {
      console.error("Erro ao deletar usuário:", err);
      res.status(500).json({ erro: "Erro ao deletar usuário." });
    }
  }
);

module.exports = router;
