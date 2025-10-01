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
    if (req?.usuario?.role !== "admin") {
      return res
        .status(403)
        .json({ mensagem: "Apenas admin pode criar produtos." });
    }

    let { nome, preco, padaria } = req.body;

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

    // evitar duplicidade de nome por padaria
    const existente = await Produto.findOne({ padaria, nome }).lean();
    if (existente) {
      return res.status(409).json({
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
 * GET /produtos?padaria=:id (admin) | (gerente usa sua própria padaria)
 * Query extra: ?incluirInativos=1 para listar inclusive inativos
 */
exports.listarProdutos = async (req, res) => {
  try {
    const role = req?.usuario?.role;

    const filtroPadaria =
      role === "admin" ? req.query.padaria : req?.usuario?.padaria;

    if (!filtroPadaria || !mongoose.Types.ObjectId.isValid(filtroPadaria)) {
      return res
        .status(400)
        .json({ mensagem: "Padaria não informada/ inválida." });
    }

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

/**
 * PATCH /produtos/:id
 * Atualizar parcialmente um produto (APENAS admin)
 */
exports.atualizarProduto = async (req, res) => {
  try {
    if (req?.usuario?.role !== "admin") {
      return res
        .status(403)
        .json({ mensagem: "Apenas admin pode atualizar produtos." });
    }

    const { id } = req.params;
    const updates = {};
    const { nome, preco, padaria, ativo } = req.body;

    if (typeof nome === "string" && nome.trim()) {
      updates.nome = nome.trim();
    }

    if (preco !== undefined) {
      const precoNumber = Number(preco);
      if (!Number.isFinite(precoNumber) || precoNumber <= 0) {
        return res.status(400).json({ mensagem: "Preço inválido." });
      }
      updates.preco = precoNumber;
    }

    if (padaria !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(padaria)) {
        return res.status(400).json({ mensagem: "Padaria inválida." });
      }
      updates.padaria = padaria;
    }

    if (ativo !== undefined) {
      if (typeof ativo !== "boolean") {
        return res
          .status(400)
          .json({ mensagem: "Campo 'ativo' deve ser booleano." });
      }
      updates.ativo = ativo;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ mensagem: "Nada para atualizar." });
    }

    const atualizado = await Produto.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!atualizado) {
      return res.status(404).json({ mensagem: "Produto não encontrado." });
    }

    return res.json(atualizado);
  } catch (error) {
    logger.error("Erro ao atualizar produto:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao atualizar produto", erro: error.message });
  }
};

/**
 * DELETE /produtos/:id
 * Excluir produto (APENAS admin)
 */
exports.excluirProduto = async (req, res) => {
  try {
    if (req?.usuario?.role !== "admin") {
      return res
        .status(403)
        .json({ mensagem: "Apenas admin pode excluir produtos." });
    }

    const { id } = req.params;
    const removido = await Produto.findByIdAndDelete(id).lean();

    if (!removido) {
      return res.status(404).json({ mensagem: "Produto não encontrado." });
    }

    return res.json({ mensagem: "Produto excluído com sucesso." });
  } catch (error) {
    logger.error("Erro ao excluir produto:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao excluir produto", erro: error.message });
  }
};
