const Produto = require("../models/Produto");

// Criar novo produto (admin)
exports.criarProduto = async (req, res) => {
  try {
    const { nome, preco, padaria } = req.body;

    if (!nome || !preco || !padaria) {
      return res
        .status(400)
        .json({ mensagem: "Nome, preço e padaria são obrigatórios." });
    }

    const novoProduto = await Produto.create({
      nome,
      preco,
      padaria,
    });

    res.status(201).json(novoProduto);
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao criar produto", erro: error.message });
  }
};

// Listar produtos da padaria
exports.listarProdutos = async (req, res) => {
  try {
    const filtroPadaria =
      req.usuario.role === "admin" ? req.query.padaria : req.usuario.padaria;

    if (!filtroPadaria) {
      return res.status(400).json({ mensagem: "Padaria não informada." });
    }

    const produtos = await Produto.find({
      padaria: filtroPadaria,
      ativo: true,
    });
    res.json(produtos);
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao listar produtos", erro: error.message });
  }
};
