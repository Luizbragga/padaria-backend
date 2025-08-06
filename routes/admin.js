const express = require("express");
const router = express.Router();
const Padaria = require("../models/Padaria");
const Usuario = require("../models/Usuario");
const Entrega = require("../models/Entrega");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Joi = require("joi");

// Rota para obter painel completo
router.get("/painel", autenticar, autorizar("admin"), async (req, res) => {
  try {
    const padarias = await Padaria.find({ ativa: true });

    const painel = await Promise.all(
      padarias.map(async (padaria) => {
        const usuarios = await Usuario.find({ padaria: padaria._id }).select(
          "nome email role"
        );

        const entregas = await Entrega.find({ padaria: padaria._id });
        const totalEntregas = entregas.length;
        const entregasPagas = entregas.filter((e) => e.pago).length;
        const inadimplentes = entregas.filter((e) => !e.pago).length;

        return {
          nome: padaria.nome,
          cidade: padaria.cidade,
          estado: padaria.estado,
          usuarios,
          totalEntregas,
          entregasPagas,
          inadimplentes,
        };
      })
    );

    res.json(painel);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao gerar painel do admin" });
  }
});

// Esquema Joi para validação da atualização de usuário
const usuarioAtualizacaoSchema = Joi.object({
  nome: Joi.string().optional(),
  email: Joi.string().email().optional(),
  role: Joi.string().valid("entregador", "gerente", "admin").optional(),
  padaria: Joi.string().optional(),
});

// Rota para editar usuário
router.put(
  "/usuarios/:id",
  autenticar,
  autorizar("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Validar dados
      const { error } = usuarioAtualizacaoSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ erro: error.details[0].message });
      }

      // Atualizar usuário
      const usuarioAtualizado = await Usuario.findByIdAndUpdate(id, req.body, {
        new: true,
        runValidators: true,
      }).select("-senha");

      if (!usuarioAtualizado) {
        return res.status(404).json({ erro: "Usuário não encontrado." });
      }

      res.json(usuarioAtualizado);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ erro: "Email já cadastrado." });
      }
      res.status(500).json({ erro: "Erro ao atualizar usuário." });
    }
  }
);
// Rota para deletar usuário por ID (somente admin)
router.delete(
  "/usuarios/:id",
  autenticar,
  autorizar("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const usuarioRemovido = await Usuario.findByIdAndDelete(id);

      if (!usuarioRemovido) {
        return res.status(404).json({ erro: "Usuário não encontrado." });
      }

      res.json({
        mensagem: "Usuário removido com sucesso.",
        usuario: usuarioRemovido,
      });
    } catch (err) {
      res.status(500).json({ erro: "Erro ao deletar usuário." });
    }
  }
);

module.exports = router;
