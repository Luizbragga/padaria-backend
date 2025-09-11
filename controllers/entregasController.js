const mongoose = require("mongoose");
const Entrega = require("../models/Entrega");
const {
  entregaSchemaCriacao,
  entregaSchemaAtualizacao,
} = require("../validations/entregaValidation");

/* ========================= helpers ========================= */

const OID = (v) =>
  mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v;

function role(req) {
  return req?.usuario?.role;
}

function padariaDoReq(req) {
  // admin pode escolher (body/query); gerente/entregador = própria
  if (role(req) === "admin") return req.body.padaria || req.query.padaria;
  return req.usuario?.padaria;
}

function parseLocation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function ensureLocationOr400(reqBody) {
  const loc = parseLocation(reqBody?.location);
  if (!loc) {
    const err = new Error(
      "Latitude/Longitude são obrigatórias: location { lat, lng }."
    );
    err.status = 400;
    throw err;
  }
  return loc;
}

function validateProdutos(produtos) {
  if (!Array.isArray(produtos) || produtos.length === 0) {
    const e = new Error("Lista de produtos é obrigatória.");
    e.status = 400;
    throw e;
  }
  for (const p of produtos) {
    if (!p || typeof p !== "object" || !p.nome) {
      const e = new Error("Produto inválido (nome é obrigatório).");
      e.status = 400;
      throw e;
    }
    const qtd = Number(p.quantidade ?? 0);
    const preco = Number(p.precoUnitario ?? 0);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      const e = new Error("Quantidade do produto deve ser > 0.");
      e.status = 400;
      throw e;
    }
    if (!Number.isFinite(preco) || preco < 0) {
      const e = new Error("Preço unitário do produto inválido.");
      e.status = 400;
      throw e;
    }
  }
}

function withSubtotais(produtos) {
  return produtos.map((p) => {
    const quantidade = Number(p.quantidade);
    const precoUnitario = Number(p.precoUnitario);
    return {
      nome: p.nome,
      quantidade,
      precoUnitario,
      subtotal: Number((quantidade * precoUnitario).toFixed(2)),
    };
  });
}

/* ========================= controllers ========================= */

// Listar entregas com filtros (sempre por padaria)
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

    const padaria = padariaDoReq(req);
    if (!padaria)
      return res.status(400).json({ mensagem: "Padaria não informada" });

    const filtro = { padaria: OID(padaria) };

    if (cliente) filtro.cliente = { $regex: cliente, $options: "i" };
    if (produto) filtro["produtos.nome"] = { $regex: produto, $options: "i" };
    if (pago !== undefined) filtro.pago = String(pago) === "true";
    if (entregue !== undefined) filtro.entregue = String(entregue) === "true";
    if (data) {
      const dia = new Date(data);
      const proximoDia = new Date(dia);
      proximoDia.setDate(dia.getDate() + 1);
      filtro.createdAt = { $gte: dia, $lt: proximoDia };
    }

    // entregador só deve ver as próprias (se essa rota for usada por ele)
    if (role(req) === "entregador") {
      filtro.entregador = OID(req.usuario.id);
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

// Criar nova entrega (exige location, produtos válidos e padaria)
exports.criarEntrega = async (req, res) => {
  try {
    const { error } = entregaSchemaCriacao.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({ mensagem: "Dados inválidos", erro: error.message });

    const padaria = padariaDoReq(req);
    if (!padaria)
      return res.status(400).json({ mensagem: "Padaria não informada" });

    // lat/lng obrigatórios
    const location = ensureLocationOr400(req.body);

    // produtos
    validateProdutos(req.body.produtos);
    const produtos = withSubtotais(req.body.produtos);

    const novaEntrega = await Entrega.create({
      ...req.body,
      produtos,
      padaria: OID(padaria),
      location,
    });

    res.status(201).json(novaEntrega);
  } catch (error) {
    res
      .status(error.status || 400)
      .json({ mensagem: "Erro ao criar entrega", erro: error.message });
  }
};

// Atualizar entrega (mantém regras de location/produtos se vierem)
exports.atualizarEntrega = async (req, res) => {
  try {
    const { error } = entregaSchemaAtualizacao.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({ mensagem: "Dados inválidos", erro: error.message });

    const update = { ...req.body };

    if (update.location) {
      const loc = parseLocation(update.location);
      if (!loc) {
        return res.status(400).json({
          mensagem:
            "Latitude/Longitude inválidas. Use location { lat, lng } válidos.",
        });
      }
      update.location = loc;
    }

    if (Array.isArray(update.produtos)) {
      validateProdutos(update.produtos);
      update.produtos = withSubtotais(update.produtos);
    }

    // entregador só pode atualizar a própria entrega (se for usado por ele)
    const filtro =
      role(req) === "entregador"
        ? { _id: req.params.id, entregador: OID(req.usuario.id) }
        : { _id: req.params.id };

    const entrega = await Entrega.findOneAndUpdate(filtro, update, {
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

// Deletar entrega (admin/gerente da mesma padaria; entregador não)
exports.deletarEntrega = async (req, res) => {
  try {
    if (role(req) === "entregador") {
      return res.status(403).json({ mensagem: "Acesso negado." });
    }

    const padaria = padariaDoReq(req);
    if (!padaria)
      return res.status(400).json({ mensagem: "Padaria não informada" });

    const entrega = await Entrega.findOneAndDelete({
      _id: req.params.id,
      padaria: OID(padaria),
    });

    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    res.json({ mensagem: "Entrega removida", entrega });
  } catch (error) {
    res
      .status(400)
      .json({ mensagem: "Erro ao deletar entrega", erro: error.message });
  }
};

// Concluir entrega (apenas o entregador responsável)
exports.concluirEntrega = async (req, res) => {
  try {
    const entrega = await Entrega.findOne({
      _id: req.params.id,
      entregador: OID(req.usuario.id),
    });

    if (!entrega)
      return res.status(404).json({
        mensagem: "Entrega não encontrada ou não pertence ao entregador.",
      });

    entrega.entregue = true;
    if (!entrega.padaria) entrega.padaria = OID(padariaDoReq(req));
    await entrega.save();

    res.json({ mensagem: "Entrega concluída com sucesso!", entrega });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao concluir entrega", erro: error.message });
  }
};

// Relatar problema (entregador: só a própria; gerente/admin: qualquer da padaria)
exports.relatarProblema = async (req, res) => {
  try {
    const { tipo, descricao } = req.body;
    if (!tipo || !descricao)
      return res
        .status(400)
        .json({ mensagem: "Tipo e descrição obrigatórios" });

    let filtro = { _id: req.params.id };
    if (role(req) === "entregador") {
      filtro.entregador = OID(req.usuario.id);
    } else {
      // garante mesma padaria
      const padaria = padariaDoReq(req);
      if (!padaria)
        return res.status(400).json({ mensagem: "Padaria não informada" });
      filtro.padaria = OID(padaria);
    }

    const entrega = await Entrega.findOne(filtro);
    if (!entrega)
      return res
        .status(404)
        .json({ mensagem: "Entrega não encontrada ou acesso negado" });

    entrega.problemas = entrega.problemas || [];
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
    const { valor, forma } = req.body;
    const v = Number(valor);
    if (!Number.isFinite(v) || v <= 0) {
      return res.status(400).json({ mensagem: "Valor inválido" });
    }

    let filtro = { _id: req.params.id };
    if (role(req) === "entregador") {
      filtro.entregador = OID(req.usuario.id);
    } else {
      const padaria = padariaDoReq(req);
      if (!padaria)
        return res.status(400).json({ mensagem: "Padaria não informada" });
      filtro.padaria = OID(padaria);
    }

    const entrega = await Entrega.findOne(filtro);
    if (!entrega)
      return res.status(404).json({ mensagem: "Entrega não encontrada" });

    entrega.pagamentos = entrega.pagamentos || [];
    entrega.pagamentos.push({
      valor: v,
      forma: (forma || "dinheiro").toLowerCase(),
      data: new Date(),
    });
    entrega.pago = true;
    entrega.entregue = true; // ✅ pagamento conclui a entrega
    if (!entrega.padaria) entrega.padaria = OID(padariaDoReq(req));
    // Só define entregador automaticamente se quem registra é um ENTREGADOR
    if (!entrega.entregador && role(req) === "entregador") {
      entrega.entregador = OID(req.usuario.id);
    }

    await entrega.save();
    res.json({ mensagem: "Pagamento registrado com sucesso", entrega });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao registrar pagamento", erro: error.message });
  }
};

// Desativar entrega (admin/gerente)
exports.desativarEntrega = async (req, res) => {
  try {
    if (role(req) === "entregador") {
      return res.status(403).json({ mensagem: "Acesso negado." });
    }

    const padaria = padariaDoReq(req);
    if (!padaria)
      return res.status(400).json({ mensagem: "Padaria não informada" });

    const entrega = await Entrega.findOne({
      _id: req.params.id,
      padaria: OID(padaria),
    });
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

// Reutilizar entrega (copia location também)
exports.reutilizarEntrega = async (req, res) => {
  try {
    const entrega = await Entrega.findById(req.params.id);
    if (!entrega)
      return res
        .status(404)
        .json({ mensagem: "Entrega original não encontrada" });

    // gerente/admin somente dentro da padaria
    if (
      role(req) !== "admin" &&
      String(entrega.padaria) !== String(req.usuario.padaria)
    ) {
      return res.status(403).json({ mensagem: "Acesso negado." });
    }

    const nova = new Entrega({
      cliente: entrega.cliente,
      endereco: entrega.endereco,
      entregador: entrega.entregador,
      produtos: entrega.produtos,
      padaria: entrega.padaria,
      location: entrega.location, // 👈 mantém destino
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

// Listar entregas do dia (gerente/admin da mesma padaria)
exports.listarEntregasDoDia = async (req, res) => {
  try {
    const padaria = padariaDoReq(req);
    if (!padaria)
      return res.status(400).json({ mensagem: "Padaria não informada" });

    const hoje = new Date();
    const inicio = new Date(hoje.setHours(0, 0, 0, 0));
    const fim = new Date(hoje.setHours(23, 59, 59, 999));

    const entregas = await Entrega.find({
      padaria: OID(padaria),
      createdAt: { $gte: inicio, $lt: fim },
    })
      .populate("entregador", "nome")
      .populate("cliente", "nome");

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

/* ===== pequenas stats simples (mantidas) ===== */
exports.contarEntregas = async (req, res) => {
  try {
    const padaria = padariaDoReq(req);
    const filtro = padaria ? { padaria: OID(padaria) } : {};
    const total = await Entrega.countDocuments(filtro);
    res.json({ total });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao contar entregas", erro: error.message });
  }
};

exports.contarInadimplentes = async (req, res) => {
  try {
    const padaria = padariaDoReq(req);
    const filtro = { pago: false };
    if (padaria) filtro.padaria = OID(padaria);
    const total = await Entrega.countDocuments(filtro);
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

    const padaria = padariaDoReq(req);
    const filtro = { createdAt: { $gte: inicio, $lte: fim } };
    if (padaria) filtro.padaria = OID(padaria);

    const total = await Entrega.countDocuments(filtro);
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

    const padaria = padariaDoReq(req);
    const filtro = { cliente: { $regex: cliente, $options: "i" } };
    if (padaria) filtro.padaria = OID(padaria);

    const total = await Entrega.countDocuments(filtro);
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

    const padaria = padariaDoReq(req);
    const filtro = { "produtos.nome": { $regex: produto, $options: "i" } };
    if (padaria) filtro.padaria = OID(padaria);

    const total = await Entrega.countDocuments(filtro);
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
    const padaria = padariaDoReq(req);

    const filtro = {};
    if (pago !== undefined) filtro.pago = String(pago) === "true";
    if (entregue !== undefined) filtro.entregue = String(entregue) === "true";
    if (padaria) filtro.padaria = OID(padaria);

    const total = await Entrega.countDocuments(filtro);
    res.json({ filtro, total });
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao contar por status", erro: error.message });
  }
};
// controllers/entregasController.js (ADICIONE)
exports.listarMinhasEntregas = async (req, res) => {
  try {
    const { id: usuarioId } = req.usuario;

    // janela de "hoje"
    const ini = new Date();
    ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini);
    fim.setDate(ini.getDate() + 1);

    const minhas = await Entrega.find({
      entregador: usuarioId,
      createdAt: { $gte: ini, $lt: fim },
      // entregue: false, // 👈 descomente se quiser mostrar só as pendentes
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(minhas);
  } catch (error) {
    res
      .status(500)
      .json({ mensagem: "Erro ao buscar suas entregas", erro: error.message });
  }
};
