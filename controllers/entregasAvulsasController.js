const EntregaAvulsa = require("../models/EntregaAvulsa");

// Criar nova entrega avulsa
exports.criarEntregaAvulsa = async (req, res) => {
  try {
    const { nomeCliente, endereco, produtos, dataEntrega } = req.body;
    const padaria =
      req.usuario.role === "admin" ? req.body.padaria : req.usuario.padaria;

    if (!nomeCliente || !endereco || !produtos || !dataEntrega) {
      return res.status(400).json({ mensagem: "Campos obrigatórios ausentes" });
    }

    const novaEntrega = await EntregaAvulsa.create({
      ...req.body,
      padaria,
    });

    res.status(201).json(novaEntrega);
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao criar entrega avulsa", erro: error.message });
  }
};

// Listar entregas avulsas por padaria
exports.listarEntregasAvulsas = async (req, res) => {
  try {
    const filtro = {
      padaria:
        req.usuario.role === "admin" ? req.query.padaria : req.usuario.padaria,
    };

    if (req.query.data) {
      const inicio = new Date(req.query.data);
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(req.query.data);
      fim.setHours(23, 59, 59, 999);
      filtro.dataEntrega = { $gte: inicio, $lte: fim };
    }

    const entregas = await EntregaAvulsa.find(filtro).sort({ dataEntrega: 1 });
    res.json(entregas);
  } catch (error) {
    res
      .status(500)
      .json({
        mensagem: "Erro ao listar entregas avulsas",
        erro: error.message,
      });
  }
};

// Marcar entrega como concluída
exports.marcarComoEntregue = async (req, res) => {
  try {
    const entrega = await EntregaAvulsa.findById(req.params.id);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    entrega.entregue = true;
    await entrega.save();

    res.json({ mensagem: "Entrega marcada como concluída", entrega });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao marcar entrega", erro: error.message });
  }
};

// Registrar pagamento
exports.registrarPagamento = async (req, res) => {
  try {
    const { valor, forma } = req.body;
    const entrega = await EntregaAvulsa.findById(req.params.id);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    entrega.pagamentos.push({
      valor,
      forma: forma || "não informado",
      data: new Date(),
    });
    entrega.pago = true;

    await entrega.save();
    res.json({ mensagem: "Pagamento registrado com sucesso", entrega });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao registrar pagamento", erro: error.message });
  }
};

// Deletar entrega avulsa
exports.deletarEntregaAvulsa = async (req, res) => {
  try {
    const entrega = await EntregaAvulsa.findByIdAndDelete(req.params.id);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });
    res.json({ mensagem: "Entrega avulsa deletada com sucesso", entrega });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao deletar entrega", erro: error.message });
  }
};
