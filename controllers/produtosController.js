// controllers/produtosController.js
const mongoose = require("mongoose");
const Produto = require("../models/Produto");
const logger = require("../logs/utils/logger");

/**
 * POST /produtos
 * Criar novo produto (APENAS admin)
 */
exports.criarProduto = async (req, res) => {
  try {
    // segurança: apenas admin cria
    if (req?.usuario?.role !== "admin") {
      return res
        .status(403)
        .json({ mensagem: "Apenas admin pode criar produtos." });
    }

    let { nome, preco, padaria } = req.body;

    // validações básicas
    if (!nome || typeof nome !== "string" || !nome.trim()) {
      return res.status(400).json({ mensagem: "Nome é obrigatório." });
    }
    nome = nome.trim();

    const precoNumber = Number(preco);
    if (!Number.isFinite(precoNumber) || precoNumber <= 0) {
      return res.status(400).json({ mensagem: "Preço inválido." });
    }

    if (!padaria || !mongoose.Types.ObjectId.isValid(padaria)) {
      return res
        .status(400)
        .json({ mensagem: "Padaria inválida/obrigatória." });
    }

    // (opcional) evitar duplicidade de nome por padaria
    const existente = await Produto.findOne({ padaria, nome }).lean();
    if (existente) {
      return res
        .status(409)
        .json({
          mensagem: "Já existe um produto com esse nome nessa padaria.",
        });
    }

    const novoProduto = await Produto.create({
      nome,
      preco: precoNumber,
      padaria,
      ativo: true,
    });

    return res.status(201).json(novoProduto);
  } catch (error) {
    logger.error("Erro ao criar produto:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao criar produto", erro: error.message });
  }
};

/**
 * GET /produtos?padaria=:id (admin) | (gerente/entregador usam sua própria padaria)
 * Query extra: ?incluirInativos=1 para listar inclusive inativos
 */
exports.listarProdutos = async (req, res) => {
  try {
    const role = req?.usuario?.role;

    // qual padaria?
    const filtroPadaria =
      role === "admin" ? req.query.padaria : req?.usuario?.padaria;

    if (!filtroPadaria || !mongoose.Types.ObjectId.isValid(filtroPadaria)) {
      return res
        .status(400)
        .json({ mensagem: "Padaria não informada/ inválida." });
    }

    // incluir inativos se ?incluirInativos=1
    const incluirInativos = String(req.query.incluirInativos || "") === "1";
    const filtro = { padaria: filtroPadaria };
    if (!incluirInativos) filtro.ativo = true;

    const produtos = await Produto.find(filtro).sort({ nome: 1 }).lean();

    return res.json(produtos);
  } catch (error) {
    logger.error("Erro ao listar produtos:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao listar produtos", erro: error.message });
  }
};
