// routes/padarias.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Joi = require("joi");
const Cliente = require("../models/Cliente");
const Padaria = require("../models/Padaria");
const padariasController = require("../controllers/padariasController");
const { deletePadariaCascade } = require("../controllers/padariasCascade");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const validate = require("../middlewares/validate");

/* =========================
   Schemas de validação (Joi)
   ========================= */
const criarPadariaSchema = Joi.object({
  nome: Joi.string().trim().min(2).max(120).required(),
  cidade: Joi.string().trim().min(2).max(120).required(),
  freguesia: Joi.string().trim().allow("").max(120).optional(),
  ativa: Joi.boolean().optional(),
  rotasDisponiveis: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().trim().min(1).max(20)).max(50),
      Joi.string().allow("")
    )
    .optional(),
});

// Query de listagem: filtros e paginação opcionais (contrato preservado)
const listarPadariasQuerySchema = Joi.object({
  nome: Joi.string().trim().min(1).max(120),
  cidade: Joi.string().trim().min(1).max(120),
  ativa: Joi.alternatives().try(Joi.number().valid(0, 1), Joi.boolean()),
  // paginação/ordenacão opcionais (se o controller ignorar, não quebramos contrato)
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid(
    "nome",
    "cidade",
    "freguesia",
    "ativa",
    "createdAt",
    "updatedAt"
  ),
  order: Joi.string().valid("asc", "desc"),
}).unknown(false);

const objectIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

/* ========================= ROTAS ========================= */

// Criar padaria (ADMIN)
router.post(
  "/",
  autenticar,
  autorizar("admin"),
  validate(criarPadariaSchema), // valida body
  async (req, res) => {
    try {
      const value = req.body;

      // normalizar rotasDisponiveis (array ou "A,B,C")
      let rotasDisponiveis = [];
      if (Array.isArray(value.rotasDisponiveis)) {
        rotasDisponiveis = value.rotasDisponiveis;
      } else if (typeof value.rotasDisponiveis === "string") {
        rotasDisponiveis = value.rotasDisponiveis
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      // montar payload final (model sanitiza/uppercase/únicos)
      const payload = {
        nome: value.nome,
        cidade: value.cidade,
        freguesia: value.freguesia || "",
        ativa: value.ativa,
        rotasDisponiveis,
      };

      // evitar duplicidade por nome+cidade+estado
      const existe = await Padaria.findOne({
        nome: payload.nome,
        cidade: payload.cidade,
        estado: payload.estado,
      }).lean();

      if (existe) {
        return res
          .status(409)
          .json({ mensagem: "Já existe uma padaria com esses dados." });
      }

      const novaPadaria = await Padaria.create(payload);
      return res.status(201).json(novaPadaria);
    } catch (erro) {
      return res
        .status(400)
        .json({ mensagem: "Erro ao criar padaria", erro: erro.message });
    }
  }
);

// Listar padarias (ADMIN)
router.get(
  "/",
  autenticar,
  autorizar("admin"),
  validate(listarPadariasQuerySchema, "query"),
  padariasController.listarPadarias
);

// Listar usuários de uma padaria (ADMIN)
router.get(
  "/:id/usuarios",
  autenticar,
  autorizar("admin"),
  validate(objectIdParamSchema, "params"),
  padariasController.listarUsuariosPorPadaria
);

// Desativar padaria (ADMIN)
router.patch(
  "/:id/desativar",
  autenticar,
  autorizar("admin"),
  validate(objectIdParamSchema, "params"),
  async (req, res) => {
    try {
      const { id } = req.params;

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
  validate(objectIdParamSchema, "params"),
  async (req, res) => {
    try {
      const { id } = req.params;

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
router.delete(
  "/:id",
  autenticar,
  autorizar("admin"),
  validate(objectIdParamSchema, "params"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const { usedTransaction, results } = await deletePadariaCascade(id);

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
  }
);

// GET /padarias/:id/rotas  -> todas as rotas disponíveis para cadastro
router.get(
  "/:id/rotas",
  autenticar,
  autorizar("admin", "gerente"),
  validate(objectIdParamSchema, "params"),
  async (req, res) => {
    const { id } = req.params;

    const pad = await Padaria.findById(id).lean();
    if (!pad) return res.status(404).json({ erro: "Padaria não encontrada." });

    const fromPad = (pad.rotasDisponiveis || [])
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean);

    const fromCli = (await Cliente.distinct("rota", { padaria: id }))
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean);

    const nomes = Array.from(new Set([...fromPad, ...fromCli])).sort();

    res.json(nomes);
  }
);

module.exports = router;
