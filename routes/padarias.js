// routes/padarias.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Joi = require("joi");

const Padaria = require("../models/Padaria");
const padariasController = require("../controllers/padariasController");
const { deletePadariaCascade } = require("../controllers/padariasCascade");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

/* =========================
   Schemas de validação (Joi)
   ========================= */
const criarPadariaSchema = Joi.object({
  nome: Joi.string().trim().min(2).max(120).required(),
  cidade: Joi.string().trim().min(2).max(120).required(),
  estado: Joi.string().trim().min(1).max(60).required(),
  ativa: Joi.boolean().optional(), // default no model já é true
});

/* Pequeno helper pra validar ObjectId */
function garantirObjectIdValido(id, res) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ erro: "ID inválido." });
    return false;
  }
  return true;
}

/* =========================
   ROTAS
   ========================= */

// Criar padaria (ADMIN)
router.post("/", autenticar, autorizar("admin"), async (req, res) => {
  try {
    const { error, value } = criarPadariaSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ mensagem: "Dados inválidos", erro: error.message });
    }

    // (opcional) evitar duplicidade por nome+cidade+estado
    const existe = await Padaria.findOne({
      nome: value.nome,
      cidade: value.cidade,
      estado: value.estado,
    }).lean();

    if (existe) {
      return res
        .status(409)
        .json({ mensagem: "Já existe uma padaria com esses dados." });
    }

    const novaPadaria = await Padaria.create(value);
    return res.status(201).json(novaPadaria);
  } catch (erro) {
    return res
      .status(400)
      .json({ mensagem: "Erro ao criar padaria", erro: erro.message });
  }
});

// Listar padarias (ADMIN)
router.get(
  "/",
  autenticar,
  autorizar("admin"),
  padariasController.listarPadarias
);

// Listar usuários de uma padaria (ADMIN)
router.get(
  "/:id/usuarios",
  autenticar,
  autorizar("admin"),
  (req, res, next) => {
    if (!garantirObjectIdValido(req.params.id, res)) return;
    next();
  },
  padariasController.listarUsuariosPorPadaria
);

// Desativar padaria (ADMIN)
router.patch(
  "/:id/desativar",
  autenticar,
  autorizar("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!garantirObjectIdValido(id, res)) return;

      const padaria = await Padaria.findById(id);
      if (!padaria)
        return res.status(404).json({ erro: "Padaria não encontrada." });

      if (padaria.ativa === false) {
        return res.json({ mensagem: "Padaria já está desativada.", padaria });
      }

      padaria.ativa = false;
      await padaria.save();

      return res.json({ mensagem: "Padaria desativada com sucesso.", padaria });
    } catch (err) {
      return res.status(500).json({ erro: "Erro ao desativar padaria." });
    }
  }
);

// Ativar padaria (ADMIN)
router.patch(
  "/:id/ativar",
  autenticar,
  autorizar("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!garantirObjectIdValido(id, res)) return;

      const padaria = await Padaria.findById(id);
      if (!padaria)
        return res.status(404).json({ erro: "Padaria não encontrada." });

      if (padaria.ativa === true) {
        return res.json({ mensagem: "Padaria já está ativa.", padaria });
      }

      padaria.ativa = true;
      await padaria.save();

      return res.json({ mensagem: "Padaria ativada com sucesso.", padaria });
    } catch (err) {
      return res.status(500).json({ erro: "Erro ao ativar padaria." });
    }
  }
);

// Deletar padaria (ADMIN) — com exclusão em cascata
router.delete("/:id", autenticar, autorizar("admin"), async (req, res) => {
  const { id } = req.params;
  if (!garantirObjectIdValido(id, res)) return;

  try {
    const { usedTransaction, results } = await deletePadariaCascade(id);

    // resumo amigável (apenas contagens)
    const resumo = {
      entregas: results.entregas?.deletedCount ?? 0,
      entregasAvulsas: results.entregasAvulsas?.deletedCount ?? 0,
      ajustesPontuais: results.ajustesPontuais?.deletedCount ?? 0,
      solicitacoes: results.solicitacoes?.deletedCount ?? 0,
      rotasDia: results.rotasDia?.deletedCount ?? 0,
      rotasOverride: results.rotasOverride?.deletedCount ?? 0,
      saldoDiario: results.saldoDiario?.deletedCount ?? 0,
      produtos: results.produtos?.deletedCount ?? 0,
      clientes: results.clientes?.deletedCount ?? 0,
      config: results.config?.deletedCount ?? 0,
      refreshTokens: results.refreshTokens?.deletedCount ?? 0,
      rotasEntregador: results.rotasEntregador?.deletedCount ?? 0,
      usuarios: results.usuarios?.deletedCount ?? 0,
      padaria: results.padaria?.deletedCount ?? 0,
    };

    return res.json({
      mensagem: "Padaria e dados vinculados excluídos com sucesso.",
      usedTransaction,
      resumo,
    });
  } catch (err) {
    if (err?.code === "PADARIA_NOT_FOUND") {
      return res.status(404).json({ erro: "Padaria não encontrada." });
    }
    if (err?.code === "INVALID_ID") {
      return res.status(400).json({ erro: "ID de padaria inválido." });
    }
    return res
      .status(500)
      .json({ erro: "Erro ao excluir padaria.", detalhe: err?.message });
  }
});

module.exports = router;
