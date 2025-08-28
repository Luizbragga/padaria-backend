// controllers/analiticoController.js
const mongoose = require("mongoose");
const Entrega = require("../models/Entrega");
const Usuario = require("../models/Usuario");

// ——— helpers
const toObjectIdIfValid = (v) =>
  mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v;

const getPadariaFromReq = (req) =>
  req.query.padaria || req.query.padariaId || req.usuario?.padaria || null;

const hojeRange = () => {
  const ini = new Date();
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini);
  fim.setDate(ini.getDate() + 1);
  return { ini, fim };
};

const sumProdutosEsperado = (entrega) => {
  if (!Array.isArray(entrega?.produtos)) return 0;
  return entrega.produtos.reduce((acc, p) => {
    if (typeof p?.subtotal === "number") return acc + p.subtotal;
    const qtd = Number(p?.quantidade || 0);
    const pu = Number(p?.precoUnitario || 0);
    return acc + qtd * pu;
  }, 0);
};

const sumPagamentos = (entrega) => {
  if (!Array.isArray(entrega?.pagamentos)) return 0;
  return entrega.pagamentos.reduce(
    (acc, pg) => acc + (Number(pg?.valor) || 0),
    0
  );
};

/* ========== ENDPOINTS ========== */

// /analitico/entregas-por-dia
exports.entregasPorDia = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    const match = {};
    if (padariaId) match.padaria = toObjectIdIfValid(padariaId);

    const resultado = await Entrega.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          entregues: { $sum: { $cond: ["$entregue", 1, 0] } },
          naoEntregues: { $sum: { $cond: ["$entregue", 0, 1] } },
        },
      },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 0,
          data: "$_id",
          entregues: 1,
          naoEntregues: 1,
        },
      },
    ]);

    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de entregas por dia." });
  }
};

// /analitico/inadimplencia
// Retorna: { pagantes, inadimplentes }
exports.inadimplencia = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    const match = {};
    if (padariaId) match.padaria = toObjectIdIfValid(padariaId);

    const agreg = await Entrega.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$pago",
          total: { $sum: 1 },
        },
      },
    ]);

    const pagantes = agreg.find((x) => x._id === true)?.total || 0;
    const inadimplentes = agreg.find((x) => x._id === false)?.total || 0;

    res.json({ pagantes, inadimplentes });
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao gerar relatório de inadimplência." });
  }
};

// (opcional / não usado no front atual)
exports.produtosMaisEntregues = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    const match = {};
    if (padariaId) match.padaria = toObjectIdIfValid(padariaId);

    const resultado = await Entrega.aggregate([
      { $match: match },
      { $unwind: "$produtos" },
      {
        $group: {
          _id: "$produtos.nome",
          quantidadeTotal: { $sum: "$produtos.quantidade" },
        },
      },
      {
        $project: {
          _id: 0,
          produto: "$_id",
          quantidadeTotal: 1,
        },
      },
      { $sort: { quantidadeTotal: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao gerar ranking de produtos." });
  }
};

// /analitico/entregas-por-entregador?padaria=...
// controllers/analiticoController.js
// ... topo do arquivo já tem: const mongoose = require("mongoose");

exports.entregasPorEntregador = async (req, res) => {
  try {
    // Se for admin, pode passar ?padaria=<id>. Caso contrário, usa a padaria do usuário logado.
    const padariaParam =
      req.usuario?.role === "admin" ? req.query.padaria : req.usuario?.padaria;

    if (!padariaParam || !mongoose.Types.ObjectId.isValid(padariaParam)) {
      return res
        .status(400)
        .json({ erro: "Padaria não informada ou inválida para este usuário." });
    }

    const match = { padaria: new mongoose.Types.ObjectId(padariaParam) };

    const resultado = await Entrega.aggregate([
      { $match: match },

      {
        $group: {
          _id: "$entregador", // pode ser null em entregas ainda não atribuídas
          totalEntregas: { $sum: 1 },
          entregues: { $sum: { $cond: ["$entregue", 1, 0] } },
          pendentes: { $sum: { $cond: ["$entregue", 0, 1] } },
        },
      },

      // Traz o nome do entregador (se houver)
      {
        $lookup: {
          from: "usuarios",
          localField: "_id",
          foreignField: "_id",
          as: "entregadorInfo",
        },
      },
      {
        $unwind: {
          path: "$entregadorInfo",
          preserveNullAndEmptyArrays: true, // mantém linhas sem entregador ainda
        },
      },

      {
        $project: {
          _id: 0,
          entregadorId: "$_id",
          entregador: {
            $ifNull: ["$entregadorInfo.nome", "Sem entregador"],
          },
          totalEntregas: 1,
          entregues: 1,
          pendentes: 1,
        },
      },

      // ordena por total desc (cara de ranking)
      { $sort: { totalEntregas: -1, entregues: -1 } },
    ]);

    res.json(resultado);
  } catch (erro) {
    console.error("Erro em entregasPorEntregador:", erro);
    res.status(500).json({ erro: "Erro ao gerar relatório de entregadores." });
  }
};

// (opcionais não usados no front agora)
exports.problemasPorTipo = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    const match = {};
    if (padariaId) match.padaria = toObjectIdIfValid(padariaId);

    const resultado = await Entrega.aggregate([
      { $match: match },
      { $unwind: "$problemas" },
      { $group: { _id: "$problemas.tipo", total: { $sum: 1 } } },
      { $project: { _id: 0, tipo: "$_id", total: 1 } },
      { $sort: { total: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de problemas por tipo." });
  }
};

exports.problemasPorCliente = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    const match = {};
    if (padariaId) match.padaria = toObjectIdIfValid(padariaId);

    const resultado = await Entrega.aggregate([
      { $match: match },
      { $unwind: "$problemas" },
      { $group: { _id: "$cliente", total: { $sum: 1 } } },
      { $project: { _id: 0, cliente: "$_id", total: 1 } },
      { $sort: { total: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de problemas por cliente." });
  }
};

// /analitico/formas-pagamento (opcional)
exports.formasDePagamento = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json([]);

    const resultado = await Entrega.aggregate([
      {
        $match: {
          padaria: toObjectIdIfValid(padariaId),
          "pagamentos.0": { $exists: true },
        },
      },
      { $unwind: "$pagamentos" },
      {
        $group: {
          _id: "$pagamentos.forma",
          quantidade: { $sum: 1 },
          valorTotal: { $sum: "$pagamentos.valor" },
        },
      },
      { $project: { _id: 0, forma: "$_id", quantidade: 1, valorTotal: 1 } },
      { $sort: { valorTotal: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de formas de pagamento." });
  }
};

// (opcional)
exports.clientesPorMes = async (_req, res) => {
  try {
    const resultado = await Usuario.aggregate([
      {
        $group: {
          _id: {
            mes: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          },
          novosClientes: { $sum: 1 },
        },
      },
      { $project: { _id: 0, mes: "$_id.mes", novosClientes: 1 } },
      { $sort: { mes: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de clientes por mês." });
  }
};

// (opcional)
exports.mediaProdutosPorEntrega = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    const match = {};
    if (padariaId) match.padaria = toObjectIdIfValid(padariaId);

    const resultado = await Entrega.aggregate([
      { $match: match },
      { $project: { totalProdutosEntrega: { $sum: "$produtos.quantidade" } } },
      {
        $group: {
          _id: null,
          totalEntregas: { $sum: 1 },
          totalProdutos: { $sum: "$totalProdutosEntrega" },
        },
      },
      {
        $project: {
          _id: 0,
          totalEntregas: 1,
          totalProdutos: 1,
          mediaPorEntrega: {
            $cond: [
              { $eq: ["$totalEntregas", 0] },
              0,
              { $divide: ["$totalProdutos", "$totalEntregas"] },
            ],
          },
        },
      },
    ]);
    res.json(
      resultado[0] || { totalEntregas: 0, totalProdutos: 0, mediaPorEntrega: 0 }
    );
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao calcular média de produtos por entrega." });
  }
};

// /analitico/faturamento-mensal?padaria=...
// retorna: [{ mes: '2025-08', valorTotal: 123.45 }, ...]
exports.faturamentoMensal = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json([]);

    const bruto = await Entrega.aggregate([
      {
        $match: {
          "pagamentos.0": { $exists: true },
          padaria: toObjectIdIfValid(padariaId),
        },
      },
      { $unwind: "$pagamentos" },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$pagamentos.data" } },
          totalPago: { $sum: "$pagamentos.valor" },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    const saida = bruto.map((r) => ({ mes: r._id, valorTotal: r.totalPago }));
    res.json(saida);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao calcular faturamento mensal." });
  }
};

// /analitico/resumo-financeiro?padaria=...
// retorna: { totalRecebido, totalPendente, clientesPagantes }
exports.resumoFinanceiro = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId)
      return res.json({
        totalRecebido: 0,
        totalPendente: 0,
        clientesPagantes: 0,
      });

    const { ini, fim } = hojeRange();

    // pega entregas do dia da padaria
    const entregas = await Entrega.find({
      padaria: toObjectIdIfValid(padariaId),
      createdAt: { $gte: ini, $lt: fim },
    }).lean();

    let totalRecebido = 0;
    let totalPendente = 0;
    const clientesComPagamento = new Set();

    for (const e of entregas) {
      const esperado = sumProdutosEsperado(e);
      const pago = sumPagamentos(e);
      totalRecebido += pago;
      const restante = Math.max(0, esperado - pago);
      totalPendente += restante;
      if (pago > 0 && e.cliente) clientesComPagamento.add(String(e.cliente));
    }

    res.json({
      totalRecebido,
      totalPendente,
      clientesPagantes: clientesComPagamento.size,
    });
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao gerar resumo financeiro." });
  }
};

// (opcional / não usado no front atual)
exports.entregasPorPadaria = async (_req, res) => {
  try {
    const { ini, fim } = hojeRange();

    const resultado = await Entrega.aggregate([
      { $match: { createdAt: { $gte: ini, $lt: fim } } },
      {
        $lookup: {
          from: "padarias",
          localField: "padaria",
          foreignField: "_id",
          as: "padariaInfo",
        },
      },
      { $unwind: "$padariaInfo" },
      {
        $group: {
          _id: "$padaria",
          nomePadaria: { $first: "$padariaInfo.nome" },
          entregasHoje: { $sum: 1 },
          totalRecebidoHoje: {
            $sum: {
              $sum: {
                $map: {
                  input: "$pagamentos",
                  as: "p",
                  in: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$$p.data", ini] },
                          { $lt: ["$$p.data", fim] },
                        ],
                      },
                      "$$p.valor",
                      0,
                    ],
                  },
                },
              },
            },
          },
          totalPendenteHoje: {
            $sum: { $cond: [{ $eq: ["$pago", false] }, 1, 0] },
          },
        },
      },
      { $sort: { nomePadaria: 1 } },
    ]);

    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao buscar dados por padaria." });
  }
};

// /analitico/entregas-por-dia-da-semana?padaria=...
// retorno compatível com <XAxis dataKey="_id" />
exports.entregasPorDiaDaSemana = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    const match = {};
    if (padariaId) match.padaria = toObjectIdIfValid(padariaId);

    const resultados = await Entrega.aggregate([
      { $match: match },
      { $addFields: { diaSemana: { $dayOfWeek: "$createdAt" } } }, // 1=Dom ... 7=Sáb
      { $group: { _id: "$diaSemana", total: { $sum: 1 } } },
    ]);

    const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const dados = Array.from({ length: 7 }, (_, i) => {
      const item = resultados.find((r) => r._id === i + 1);
      return { _id: labels[i], total: item ? item.total : 0 };
    });

    res.json(dados);
  } catch (error) {
    res.status(500).json({ mensagem: "Erro na análise", erro: error.message });
  }
};

// /analitico/listar-entregas-do-dia (opcional)
exports.listarEntregasDoDia = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId)
      return res.json({ entregasConcluidas: [], entregasPendentes: [] });

    const { ini, fim } = hojeRange();

    const entregas = await Entrega.find({
      padaria: toObjectIdIfValid(padariaId),
      createdAt: { $gte: ini, $lt: fim },
    }).populate("entregador", "nome");

    const entregasConcluidas = [];
    const entregasPendentes = [];

    entregas.forEach((entrega) => {
      const dados = {
        id: entrega._id,
        cliente: entrega.cliente,
        endereco: entrega.endereco,
        produtos: entrega.produtos,
        entregador: entrega.entregador?.nome || "N/A",
        entregue: entrega.entregue,
        pago: entrega.pago,
        horaEntrega: entrega.updatedAt,
      };
      (entrega.entregue ? entregasConcluidas : entregasPendentes).push(dados);
    });

    res.status(200).json({ entregasConcluidas, entregasPendentes });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao buscar entregas do dia",
      detalhes: error.message,
    });
  }
};

// /analitico/localizacao-entregadores
exports.obterLocalizacaoEntregadores = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json([]);

    const entregadores = await Usuario.find({
      role: "entregador",
      padaria: toObjectIdIfValid(padariaId),
      localizacaoAtual: { $ne: null },
    }).select("nome localizacaoAtual");

    res.json(entregadores);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao buscar localização dos entregadores" });
  }
};

// /analitico/entregas-tempo-real?padaria=...
exports.entregasTempoReal = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json([]);

    const { ini, fim } = hojeRange();

    const entregasDeHoje = await Entrega.find({
      padaria: toObjectIdIfValid(padariaId),
      createdAt: { $gte: ini, $lt: fim },
    }).lean();

    res.json(entregasDeHoje);
  } catch (erro) {
    console.error("Erro ao buscar entregas tempo real:", erro);
    res.status(500).json({ erro: "Erro interno ao buscar entregas." });
  }
};

// /analitico/pagamentos (com filtros)
exports.pagamentosDetalhados = async (req, res) => {
  try {
    const { dataInicial, dataFinal, forma } = req.query;

    const filtros = {
      "pagamentos.0": { $exists: true },
      padaria: toObjectIdIfValid(getPadariaFromReq(req) || req.usuario.padaria),
    };

    if (dataInicial && dataFinal) {
      filtros["pagamentos.data"] = {
        $gte: new Date(dataInicial),
        $lte: new Date(dataFinal),
      };
    }

    // filtro precoce por forma (opcional)
    if (forma && forma !== "todas") {
      filtros["pagamentos.forma"] =
        forma === "dinheiro" ? "não informado" : forma;
    }

    const entregas = await Entrega.find(filtros).populate("entregador");

    const pagamentos = [];
    const clientesSet = new Set();
    let totalRecebido = 0;

    for (const entrega of entregas) {
      for (const pagamento of entrega.pagamentos || []) {
        const formaDoPagamento =
          pagamento.forma === "não informado" ? "dinheiro" : pagamento.forma;

        // filtro tardio por forma (caso o precoce não pegue todos)
        if (forma && forma !== "todas" && formaDoPagamento !== forma) continue;

        pagamentos.push({
          _id: pagamento._id,
          cliente: entrega.cliente,
          entregador: entrega.entregador?.nome || "Desconhecido",
          valor: Number(pagamento.valor) || 0,
          forma: formaDoPagamento,
          data: pagamento.data,
        });

        totalRecebido += Number(pagamento.valor) || 0;
        if (entrega.cliente) clientesSet.add(String(entrega.cliente));
      }
    }

    res.status(200).json({
      pagamentos,
      totalRecebido,
      totalPendente: 0,
      clientesPagantes: clientesSet.size,
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: "Erro ao buscar pagamentos detalhados" });
  }
};

// /analitico/notificacoes-recentes
exports.notificacoesRecentes = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req) || req.usuario.padaria;
    if (!padariaId) return res.json({ eventos: [] });

    const { ini, fim } = hojeRange();

    const entregas = await Entrega.find({
      padaria: toObjectIdIfValid(padariaId),
      updatedAt: { $gte: ini, $lte: fim },
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    const eventos = entregas.map((entrega) => {
      let tipo = "Atualização";
      if (Array.isArray(entrega.problemas) && entrega.problemas.length > 0)
        tipo = "Problema";
      else if (entrega.entregue) tipo = "Entrega realizada";
      else if (
        Array.isArray(entrega.pagamentos) &&
        entrega.pagamentos.length > 0
      )
        tipo = "Pagamento";

      return {
        id: entrega._id,
        cliente: entrega.cliente,
        tipo,
        horario: entrega.updatedAt,
      };
    });

    res.json({ eventos });
  } catch (erro) {
    res.status(500).json({
      erro: "Erro ao buscar notificações recentes",
      detalhes: erro.message,
    });
  }
};
