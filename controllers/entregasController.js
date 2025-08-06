const Entrega = require("../models/Entrega");
const {
  entregaSchemaCriacao,
  entregaSchemaAtualizacao,
} = require("../validations/entregaValidation");

// Funções auxiliares
function validarPadaria(req) {
  if (req.usuario.role === "admin") return req.body.padaria;
  return req.usuario.padaria;
}

// Listar entregas com filtros
exports.listarEntregas = async (req, res) => {
  try {
    const {
      cliente,
      produto,
      data,
      pago,
      entregue,
      limite = 10,
      pagina = 1,
    } = req.query;
    const filtro = {};
    if (cliente) filtro.cliente = { $regex: cliente, $options: "i" };
    if (produto) filtro["produtos.nome"] = { $regex: produto, $options: "i" };
    if (pago !== undefined) filtro.pago = pago === "true";
    if (entregue !== undefined) filtro.entregue = entregue === "true";
    if (data) {
      const dia = new Date(data);
      const proximoDia = new Date(dia);
      proximoDia.setDate(dia.getDate() + 1);
      filtro.createdAt = { $gte: dia, $lt: proximoDia };
    }

    const skip = (parseInt(pagina) - 1) * parseInt(limite);
    const entregas = await Entrega.find(filtro)
      .skip(skip)
      .limit(parseInt(limite))
      .sort({ createdAt: -1 });
    res.json(entregas);
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao buscar entregas", erro: error.message });
  }
};

// Criar nova entrega
exports.criarEntrega = async (req, res) => {
  try {
    const { error } = entregaSchemaCriacao.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({ mensagem: "Dados inválidos", erro: error.message });

    const padaria = validarPadaria(req);
    if (!padaria)
      return res.status(400).json({ mensagem: "Padaria não informada" });

    const novaEntrega = await Entrega.create({ ...req.body, padaria });
    res.status(201).json(novaEntrega);
  } catch (error) {
    res
      .status(400)
      .json({ mensagem: "Erro ao criar entrega", erro: error.message });
  }
};

// Atualizar entrega
exports.atualizarEntrega = async (req, res) => {
  try {
    const { error } = entregaSchemaAtualizacao.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({ mensagem: "Dados inválidos", erro: error.message });

    const entrega = await Entrega.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    res.json(entrega);
  } catch (error) {
    res
      .status(400)
      .json({ mensagem: "Erro ao atualizar entrega", erro: error.message });
  }
};

// Deletar entrega
exports.deletarEntrega = async (req, res) => {
  try {
    const entrega = await Entrega.findByIdAndDelete(req.params.id);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });
    res.json({ mensagem: "Entrega removida", entrega });
  } catch (error) {
    res
      .status(400)
      .json({ mensagem: "Erro ao deletar entrega", erro: error.message });
  }
};

// Concluir entrega
exports.concluirEntrega = async (req, res) => {
  try {
    const entrega = await Entrega.findOne({
      _id: req.params.id,
      entregador: req.usuario.id,
    });
    if (!entrega)
      return res.status(404).json({
        mensagem: "Entrega não encontrada ou não pertence ao entregador.",
      });

    entrega.entregue = true;
    if (!entrega.padaria) entrega.padaria = req.usuario.padaria;
    await entrega.save();

    res.json({ mensagem: "Entrega concluída com sucesso!", entrega });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao concluir entrega", erro: error.message });
  }
};

// Relatar problema
exports.relatarProblema = async (req, res) => {
  try {
    const { tipo, descricao } = req.body;
    if (!tipo || !descricao)
      return res
        .status(400)
        .json({ mensagem: "Tipo e descrição obrigatórios" });

    const entrega =
      req.usuario.role === "entregador"
        ? await Entrega.findOne({
            _id: req.params.id,
            entregador: req.usuario.id,
          })
        : await Entrega.findById(req.params.id);

    if (!entrega)
      return res
        .status(404)
        .json({ mensagem: "Entrega não encontrada ou acesso negado" });
    if (entrega.problemas?.length)
      return res.status(400).json({ mensagem: "Problema já registrado" });

    entrega.problemas.push({ tipo, descricao, data: new Date() });
    await entrega.save();

    res.json({ mensagem: "Problema registrado com sucesso", entrega });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao relatar problema", erro: error.message });
  }
};

// Registrar pagamento
exports.registrarPagamento = async (req, res) => {
  try {
    console.log("🔐 req.usuario:", req.usuario);
    const mongoose = require("mongoose");
    const { ObjectId } = mongoose.Types;

    const { valor, forma } = req.body;

    const entrega =
      req.usuario.role === "entregador"
        ? await Entrega.findOne({
            _id: req.params.id,
            entregador: new ObjectId(req.usuario.id),
          })
        : await Entrega.findById(req.params.id);

    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });
    if (!valor || isNaN(valor))
      return res.status(400).json({ mensagem: "Valor inválido" });

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

// Desativar entrega
exports.desativarEntrega = async (req, res) => {
  try {
    const entrega = await Entrega.findById(req.params.id);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    entrega.ativa = false;
    await entrega.save();

    res.json({ mensagem: "Entrega desativada com sucesso", entrega });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao desativar entrega", erro: error.message });
  }
};

// Reutilizar entrega
exports.reutilizarEntrega = async (req, res) => {
  try {
    const entrega = await Entrega.findById(req.params.id);
    if (!entrega)
      return res
        .status(404)
        .json({ mensagem: "Entrega original não encontrada" });

    const nova = new Entrega({
      cliente: entrega.cliente,
      endereco: entrega.endereco,
      entregador: entrega.entregador,
      produtos: entrega.produtos,
      padaria: entrega.padaria,
      entregue: false,
      pago: false,
      pagamentos: [],
      problemas: [],
      ativa: true,
    });

    await nova.save();
    res
      .status(201)
      .json({ mensagem: "Entrega reutilizada com sucesso", novaEntrega: nova });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao reutilizar entrega", erro: error.message });
  }
};

// Listar entregas do dia (por gerente)
exports.listarEntregasDoDia = async (req, res) => {
  try {
    const hoje = new Date();
    const inicio = new Date(hoje.setHours(0, 0, 0, 0));
    const fim = new Date(hoje.setHours(23, 59, 59, 999));

    const entregas = await Entrega.find({
      padaria: req.usuario.padaria,
      createdAt: { $gte: inicio, $lt: fim },
    }).populate("entregador", "nome");

    const concluidas = [],
      pendentes = [];
    entregas.forEach((e) => {
      const dados = {
        id: e._id,
        cliente: e.cliente,
        endereco: e.endereco,
        produtos: e.produtos,
        entregador: e.entregador?.nome || "N/A",
        entregue: e.entregue,
        pago: e.pago,
      };
      e.entregue ? concluidas.push(dados) : pendentes.push(dados);
    });

    res.json({ entregasConcluidas: concluidas, entregasPendentes: pendentes });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao buscar entregas do dia",
      detalhes: error.message,
    });
  }
};

// Estatísticas
exports.contarEntregas = async (req, res) => {
  try {
    const total = await Entrega.countDocuments();
    res.json({ total });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao contar entregas", erro: error.message });
  }
};

exports.contarInadimplentes = async (req, res) => {
  try {
    const total = await Entrega.countDocuments({ pago: false });
    res.json({ total });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao contar inadimplentes", erro: error.message });
  }
};

exports.contarPorData = async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ mensagem: "Data obrigatória" });

    const inicio = new Date(data);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(data);
    fim.setHours(23, 59, 59, 999);

    const total = await Entrega.countDocuments({
      createdAt: { $gte: inicio, $lte: fim },
    });
    res.json({ data, total });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao contar por data", erro: error.message });
  }
};

exports.contarPorCliente = async (req, res) => {
  try {
    const { cliente } = req.query;
    if (!cliente)
      return res.status(400).json({ mensagem: "Cliente obrigatório" });

    const total = await Entrega.countDocuments({
      cliente: { $regex: cliente, $options: "i" },
    });
    res.json({ cliente, total });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao contar por cliente", erro: error.message });
  }
};

exports.contarPorProduto = async (req, res) => {
  try {
    const { produto } = req.query;
    if (!produto)
      return res.status(400).json({ mensagem: "Produto obrigatório" });

    const total = await Entrega.countDocuments({
      "produtos.nome": { $regex: produto, $options: "i" },
    });
    res.json({ produto, total });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao contar por produto", erro: error.message });
  }
};

exports.contarPorStatus = async (req, res) => {
  try {
    const { pago, entregue } = req.query;
    const filtro = {};
    if (pago !== undefined) filtro.pago = pago === "true";
    if (entregue !== undefined) filtro.entregue = entregue === "true";

    const total = await Entrega.countDocuments(filtro);
    res.json({ filtro, total });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao contar por status", erro: error.message });
  }
};
