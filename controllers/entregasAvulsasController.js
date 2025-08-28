// controllers/entregasAvulsasController.js
const mongoose = require("mongoose");
const EntregaAvulsa = require("../models/EntregaAvulsa");

// helpers
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}
function parseDateOrNull(v) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function ensureNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

// Criar nova entrega avulsa (admin ou gerente)
exports.criarEntregaAvulsa = async (req, res) => {
  try {
    const role = req?.usuario?.role;
    let padaria = role === "admin" ? req.body.padaria : req?.usuario?.padaria;

    if (!padaria || !isValidObjectId(padaria)) {
      return res
        .status(400)
        .json({ mensagem: "Padaria inválida/obrigatória." });
    }

    let {
      nomeCliente,
      telefone,
      endereco,
      produtos,
      dataEntrega,
      observacoes,
      location,
    } = req.body;

    // validações obrigatórias
    if (!nomeCliente || !String(nomeCliente).trim()) {
      return res.status(400).json({ mensagem: "nomeCliente é obrigatório." });
    }
    if (!endereco || !String(endereco).trim()) {
      return res.status(400).json({ mensagem: "endereco é obrigatório." });
    }

    // ⏰ dataEntrega obrigatória e válida
    const dataEntregaDate = parseDateOrNull(dataEntrega);
    if (!dataEntregaDate) {
      return res
        .status(400)
        .json({ mensagem: "dataEntrega inválida ou ausente." });
    }

    // 📍 location obrigatório (lat/lng)
    if (
      !location ||
      ensureNumber(location.lat) === null ||
      ensureNumber(location.lng) === null
    ) {
      return res.status(400).json({
        mensagem:
          "location obrigatório. Informe { location: { lat: Number, lng: Number } }",
      });
    }
    location = {
      lat: ensureNumber(location.lat),
      lng: ensureNumber(location.lng),
    };

    // 🧺 produtos obrigatórios (nome + quantidade > 0)
    if (!Array.isArray(produtos) || produtos.length === 0) {
      return res
        .status(400)
        .json({ mensagem: "Lista de produtos é obrigatória." });
    }
    const produtosSan = [];
    for (const p of produtos) {
      const nome = p?.nome && String(p.nome).trim();
      const quantidade = ensureNumber(p?.quantidade);
      if (!nome || !quantidade || quantidade <= 0) {
        return res.status(400).json({
          mensagem:
            "Cada item de produtos deve ter { nome: string, quantidade: number>0 }",
        });
      }
      produtosSan.push({ nome, quantidade });
    }

    const novaEntrega = await EntregaAvulsa.create({
      nomeCliente: String(nomeCliente).trim(),
      telefone: telefone ? String(telefone).trim() : undefined,
      endereco: String(endereco).trim(),
      produtos: produtosSan,
      dataEntrega: dataEntregaDate,
      entregue: false,
      pago: false,
      pagamentos: [],
      observacoes: observacoes ? String(observacoes).trim() : undefined,
      padaria,
      location,
    });

    return res.status(201).json(novaEntrega);
  } catch (error) {
    return res.status(500).json({
      mensagem: "Erro ao criar entrega avulsa",
      erro: error.message,
    });
  }
};

// Listar entregas avulsas por padaria (admin/gerente)
exports.listarEntregasAvulsas = async (req, res) => {
  try {
    const role = req?.usuario?.role;
    const padaria =
      role === "admin" ? req.query.padaria : req?.usuario?.padaria;

    if (!padaria || !isValidObjectId(padaria)) {
      return res
        .status(400)
        .json({ mensagem: "Padaria não informada/ inválida." });
    }

    const filtro = { padaria };

    if (req.query.data) {
      const d = parseDateOrNull(req.query.data);
      if (!d) {
        return res.status(400).json({ mensagem: "data inválida." });
      }
      const inicio = new Date(d);
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(d);
      fim.setHours(23, 59, 59, 999);
      filtro.dataEntrega = { $gte: inicio, $lte: fim };
    }

    const entregas = await EntregaAvulsa.find(filtro).sort({ dataEntrega: 1 });
    return res.json(entregas);
  } catch (error) {
    return res.status(500).json({
      mensagem: "Erro ao listar entregas avulsas",
      erro: error.message,
    });
  }
};

// Marcar entrega como concluída (admin/gerente)
exports.marcarComoEntregue = async (req, res) => {
  try {
    const entrega = await EntregaAvulsa.findById(req.params.id);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    // escopo de padaria (gerente só na própria)
    if (
      req.usuario.role !== "admin" &&
      String(entrega.padaria) !== String(req.usuario.padaria)
    ) {
      return res.status(403).json({ mensagem: "Acesso negado." });
    }

    entrega.entregue = true;
    await entrega.save();

    return res.json({ mensagem: "Entrega marcada como concluída", entrega });
  } catch (error) {
    return res.status(500).json({
      mensagem: "Erro ao marcar entrega",
      erro: error.message,
    });
  }
};

// Registrar pagamento (admin/gerente)
exports.registrarPagamento = async (req, res) => {
  try {
    const { valor, forma } = req.body;
    const entrega = await EntregaAvulsa.findById(req.params.id);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    // escopo de padaria
    if (
      req.usuario.role !== "admin" &&
      String(entrega.padaria) !== String(req.usuario.padaria)
    ) {
      return res.status(403).json({ mensagem: "Acesso negado." });
    }

    const v = ensureNumber(valor);
    if (v === null || v <= 0) {
      return res.status(400).json({ mensagem: "Valor inválido." });
    }

    entrega.pagamentos.push({
      valor: v,
      forma: forma || "não informado",
      data: new Date(),
    });
    entrega.pago = true;

    await entrega.save();
    return res.json({ mensagem: "Pagamento registrado com sucesso", entrega });
  } catch (error) {
    return res.status(500).json({
      mensagem: "Erro ao registrar pagamento",
      erro: error.message,
    });
  }
};

// Deletar entrega avulsa (apenas admin)
exports.deletarEntregaAvulsa = async (req, res) => {
  try {
    const entrega = await EntregaAvulsa.findByIdAndDelete(req.params.id);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    return res.json({
      mensagem: "Entrega avulsa deletada com sucesso",
      entrega,
    });
  } catch (error) {
    return res.status(500).json({
      mensagem: "Erro ao deletar entrega",
      erro: error.message,
    });
  }
};
