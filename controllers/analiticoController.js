// controllers/analiticoController.js
const mongoose = require("mongoose");
const Entrega = require("../models/Entrega");
const Usuario = require("../models/Usuario");
const ConfigPadaria = require("../models/ConfigPadaria");
const Cliente = require("../models/Cliente");
const EntregaAvulsa = require("../models/EntregaAvulsa");
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
// === helpers de mês ===
function mesRange(mesStr) {
  // mesStr no formato 'YYYY-MM'; se vazio, usa mês corrente
  const hoje = new Date();
  const [y, m] = (
    mesStr ||
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
  )
    .split("-")
    .map(Number);
  const ini = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const fim = new Date(y, m, 1, 0, 0, 0, 0); // primeiro dia do mês seguinte
  return { ini, fim, mesStr: `${y}-${String(m).padStart(2, "0")}` };
}
// --- helpers para previsão por padrão semanal ---
const DIA_KEYS = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
];
const POP_PADRAO = [
  "padraoSemanal.domingo.produto",
  "padraoSemanal.segunda.produto",
  "padraoSemanal.terca.produto",
  "padraoSemanal.quarta.produto",
  "padraoSemanal.quinta.produto",
  "padraoSemanal.sexta.produto",
  "padraoSemanal.sabado.produto",
].map((p) => ({ path: p, select: "nome preco" }));

function diaKeyFromDate(d) {
  // getDay(): 0=Dom ... 6=Sáb
  return DIA_KEYS[d.getDay()];
}

function somaListaDoDia(lista = []) {
  let total = 0;
  for (const item of lista) {
    const qtd = Number(item?.quantidade) || 0;
    // preço vem do populate do produto
    const preco =
      item?.produto && typeof item.produto === "object"
        ? Number(item.produto.preco) || 0
        : 0;
    total += qtd * preco;
  }
  return total;
}

function iterateDays(start, end, cb) {
  // [start, end) exclusivo em end
  const d = new Date(start);
  while (d < end) {
    cb(d);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
}

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
// /analitico/inadimplencia?padaria=...&mes=YYYY-MM (mes opcional; default = mês atual)
// Regra: só é inadimplente quem ficou devendo ATÉ o final do mês anterior.
// O mês corrente NÃO entra como inadimplência (ainda está em curso).
exports.inadimplencia = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json({ pagantes: 0, inadimplentes: 0 });

    // pega início do mês selecionado (ou do mês atual)
    const { ini /*, fim, mesStr*/ } = mesRange(req.query.mes);

    // Total de clientes da padaria (para compor "pagantes")
    const clientes = await Cliente.find({
      padaria: toObjectIdIfValid(padariaId),
    })
      .select("_id")
      .lean();
    const totalClientes = clientes.length;

    // Todas as entregas criadas ANTES do início do mês corrente/selecionado
    const entregasAnteriores = await Entrega.find({
      padaria: toObjectIdIfValid(padariaId),
      createdAt: { $lt: ini },
    })
      .select("cliente produtos pagamentos")
      .lean();

    // Calcula pendência acumulada por cliente até o mês anterior
    const pendAnteriorPorCliente = new Map(); // clienteId -> valor em aberto

    for (const e of entregasAnteriores) {
      if (!e.cliente) continue; // ignoramos entregas sem cliente associado
      const cid = String(e.cliente);
      const esperado = sumProdutosEsperado(e); // soma do previsto da entrega
      const pago = sumPagamentos(e); // soma dos pagamentos dessa entrega
      const diff = Math.max(0, esperado - pago);
      if (diff > 0) {
        pendAnteriorPorCliente.set(
          cid,
          (pendAnteriorPorCliente.get(cid) || 0) + diff
        );
      }
    }

    const inadimplentes = [...pendAnteriorPorCliente.values()].filter(
      (v) => v > 0
    ).length;

    // "Pagantes" = clientes SEM pendência anterior
    const pagantes = Math.max(0, totalClientes - inadimplentes);

    return res.json({ pagantes, inadimplentes });
  } catch (erro) {
    console.error("Erro em inadimplencia:", erro);
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
// /analitico/faturamento-mensal?padaria=...
// retorna: [{ mes: 'YYYY-MM', valorTotal: Number }, ...]
// Soma pagamentos normais + entregas avulsas do respectivo mês
exports.faturamentoMensal = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json([]);

    // 1) Pagamentos das entregas "normais"
    const normal = await Entrega.aggregate([
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

    // 2) Entregas AVULSAS (pagas no ato)
    // Usa data ou createdAt e valor ou valorTotal (compatível com variações de schema)
    const avulsas = await EntregaAvulsa.aggregate([
      { $match: { padaria: toObjectIdIfValid(padariaId) } },
      {
        $addFields: {
          dataRef: { $ifNull: ["$data", "$createdAt"] },
          valorRef: { $ifNull: ["$valor", "$valorTotal"] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$dataRef" } },
          totalPago: { $sum: "$valorRef" },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    // 3) Mesclar os dois resultados por mês
    const mapa = new Map(); // mes -> total
    for (const r of normal)
      mapa.set(r._id, (mapa.get(r._id) || 0) + r.totalPago);
    for (const r of avulsas)
      mapa.set(r._id, (mapa.get(r._id) || 0) + r.totalPago);

    const saida = Array.from(mapa, ([mes, valorTotal]) => ({
      mes,
      valorTotal,
    })).sort((a, b) => b.mes.localeCompare(a.mes));

    res.json(saida);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao calcular faturamento mensal." });
  }
};

// GET /analitico/a-receber?padaria=...&mes=YYYY-MM
// Calcula A Receber por mês agregando por cliente, respeitando inicioCicloFaturamento por cliente
// controllers/analiticoController.js  (substitua só a função abaixo)

exports.aReceberMensal = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req) || req.usuario?.padaria;
    if (!padariaId) {
      return res.status(400).json({ erro: "Padaria não informada." });
    }
    const { ini, fim, mesStr } = mesRange(req.query.mes);
    const padaria = toObjectIdIfValid(padariaId);

    // --- helpers locais (auto contidos) ---
    const POP_PADRAO = [
      { path: "padraoSemanal.domingo.produto", select: "preco" },
      { path: "padraoSemanal.segunda.produto", select: "preco" },
      { path: "padraoSemanal.terca.produto", select: "preco" },
      { path: "padraoSemanal.quarta.produto", select: "preco" },
      { path: "padraoSemanal.quinta.produto", select: "preco" },
      { path: "padraoSemanal.sexta.produto", select: "preco" },
      { path: "padraoSemanal.sabado.produto", select: "preco" },
    ];

    const diaKeyFromDate = (d) =>
      ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"][
        d.getDay()
      ];

    const iterateDays = (start, end, cb) => {
      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      while (cur < end) {
        cb(cur);
        cur.setDate(cur.getDate() + 1);
      }
    };

    const somaListaDoDia = (lista) =>
      (Array.isArray(lista) ? lista : []).reduce((acc, it) => {
        const preco = Number(
          it?.produto?.preco ?? it?.preco ?? it?.precoUnitario ?? 0
        );
        const qtd = Number(it?.quantidade ?? it?.qtd ?? 0);
        return acc + preco * qtd;
      }, 0);

    const normaliza00 = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    // --- 1) Carrega clientes (com preço populado) ---
    const Cliente = require("../models/Cliente");
    const clientes = await Cliente.find({ padaria })
      .populate(POP_PADRAO)
      .select("nome rota padraoSemanal inicioCicloFaturamento")
      .lean();

    // --- 2) Previsto do mês por cliente (dia a dia desde o início do ciclo) ---
    const previstoPorCliente = new Map(); // id -> €
    for (const cli of clientes) {
      const cliId = String(cli._id);
      const inicioCli = cli.inicioCicloFaturamento
        ? normaliza00(cli.inicioCicloFaturamento)
        : ini;
      const start = inicioCli > ini ? inicioCli : ini;

      let previsto = 0;
      iterateDays(start, fim, (d) => {
        const key = diaKeyFromDate(d);
        const lista = cli?.padraoSemanal?.[key] || [];
        previsto += somaListaDoDia(lista);
      });

      previstoPorCliente.set(cliId, previsto);
    }

    // --- 3) Pagos do mês por cliente (Entregas recorrentes) ---
    const entregasComPagamentoNoMes = await Entrega.find({
      padaria,
      "pagamentos.0": { $exists: true },
      "pagamentos.data": { $gte: ini, $lt: fim },
    })
      .select("cliente pagamentos")
      .lean();

    const pagoPorCliente = new Map(); // id -> €
    for (const e of entregasComPagamentoNoMes) {
      const cliId = String(e.cliente || "sem-cliente");
      for (const p of e.pagamentos || []) {
        const dt = new Date(p.data);
        if (dt >= ini && dt < fim) {
          const v = Number(p?.valor) || 0;
          pagoPorCliente.set(cliId, (pagoPorCliente.get(cliId) || 0) + v);
        }
      }
    }

    // --- 4) Pendência ANTERIOR (tudo que foi criado antes de 'ini') ---
    // 4) Pendência ANTERIOR: tudo que ficou antes do início do mês selecionado (ini)
    const entregasAnteriores = await Entrega.find({
      padaria,
      createdAt: { $lt: ini },
    })
      .select("cliente produtos pagamentos")
      .lean();

    let totalPrevistoAnterior = 0;
    let totalPagoAnterior = 0;

    // mapa clienteId -> valor em aberto de meses anteriores
    const pendAnteriorPorCliente = new Map();

    for (const e of entregasAnteriores) {
      const cid = String(e.cliente || "sem-cliente");
      const prevE = sumProdutosEsperado(e); // soma dos produtos esperados nessa entrega
      const pagoE = sumPagamentos(e); // soma dos pagamentos dessa entrega

      totalPrevistoAnterior += prevE;
      totalPagoAnterior += pagoE;

      const diff = Math.max(0, prevE - pagoE);
      if (diff > 0) {
        pendAnteriorPorCliente.set(
          cid,
          (pendAnteriorPorCliente.get(cid) || 0) + diff
        );
      }
    }

    const pendenciaAnterior = Math.max(
      0,
      totalPrevistoAnterior - totalPagoAnterior
    );

    // QUANTOS clientes têm qualquer valor > 0 em aberto de meses anteriores
    const inadimplentes = [...pendAnteriorPorCliente.values()].filter(
      (v) => v > 0
    ).length;

    // --- 5) Monta saída por cliente e totais (recorrentes) ---
    let totalPrevisto = 0;
    let totalPagoRecorrente = 0;
    const clientesOut = [];

    for (const cli of clientes) {
      const id = String(cli._id);
      const prev = previstoPorCliente.get(id) || 0;
      const pago = pagoPorCliente.get(id) || 0;
      const pend = Math.max(0, prev - pago);

      clientesOut.push({
        cliente: id,
        nome: cli.nome || "",
        rota: cli.rota || "",
        previsto: prev,
        pago,
        pendente: pend,
      });

      totalPrevisto += prev;
      totalPagoRecorrente += pago;
    }

    // --- 6) Avulsas do mês (somam no pagoMes, não no previsto/pendente) ---
    const EntregaAvulsa = require("../models/EntregaAvulsa");
    const pagoAvulsasArr = await EntregaAvulsa.aggregate([
      { $match: { padaria } },
      {
        $addFields: {
          dataRef: { $ifNull: ["$data", "$createdAt"] },
          valorRef: { $ifNull: ["$valor", "$valorTotal"] },
        },
      },
      { $match: { dataRef: { $gte: ini, $lt: fim } } },
      { $group: { _id: null, total: { $sum: "$valorRef" } } },
    ]);
    const pagoAvulsasMes = pagoAvulsasArr[0]?.total || 0;

    // pendência do mês considera apenas recorrentes
    const pendenteAtual = Math.max(0, totalPrevisto - totalPagoRecorrente);
    const totalPendente = pendenteAtual + pendenciaAnterior;

    // --- resposta final ---
    return res.json({
      mes: mesStr,
      previstoMes: totalPrevisto, // só recorrentes
      pagoMes: totalPagoRecorrente + pagoAvulsasMes, // recorrentes + avulsas
      pendenteAtual, // só recorrentes
      pendenciaAnterior,
      totalPendente,
      inadimplentes,
      clientes: clientesOut, // por cliente (recorrentes)
    });
  } catch (erro) {
    console.error("Erro em aReceberMensal:", erro);
    return res.status(500).json({ erro: "Erro ao calcular A receber do mês." });
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
// /analitico/localizacao-entregadores
exports.obterLocalizacaoEntregadores = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json([]);

    const entregadores = await Usuario.find({
      role: "entregador",
      padaria: toObjectIdIfValid(padariaId),
      localizacaoAtual: { $ne: null },
    })
      .select("_id nome rotaAtual localizacaoAtual")
      .lean(); // <= resposta mais leve

    // front já normaliza _id/id/…; só retornamos direto
    return res.json(entregadores);
  } catch (erro) {
    return res
      .status(500)
      .json({ erro: "Erro ao buscar localização dos entregadores" });
  }
};

// /analitico/entregas-tempo-real?padaria=...
// /analitico/entregas-tempo-real?padaria=...
exports.entregasTempoReal = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json([]);

    const { ini, fim } = hojeRange();

    const entregasDeHoje = await Entrega.find({
      padaria: toObjectIdIfValid(padariaId),
      createdAt: { $gte: ini, $lt: fim },
    })
      .populate({ path: "cliente", select: "nome rota location" }) // <— AQUI
      .select("cliente entregue pago produtos") // leve
      .lean();

    res.json(entregasDeHoje);
  } catch (erro) {
    console.error("Erro ao buscar entregas tempo real:", erro);
    res.status(500).json({ erro: "Erro interno ao buscar entregas." });
  }
};

// /analitico/pagamentos (com filtros)
// /analitico/pagamentos (com filtros)
exports.pagamentosDetalhados = async (req, res) => {
  try {
    const { dataInicial, dataFinal, dataEspecifica, forma } = req.query;

    const padaria = toObjectIdIfValid(
      getPadariaFromReq(req) || req.usuario.padaria
    );
    if (!padaria) {
      return res.status(400).json({ mensagem: "Padaria não informada." });
    }

    // Base do filtro
    const filtros = {
      padaria,
      "pagamentos.0": { $exists: true },
    };

    // Janela de datas:
    if (dataEspecifica) {
      // um único dia [00:00, 24:00)
      const d = new Date(dataEspecifica);
      const ini = new Date(d);
      ini.setHours(0, 0, 0, 0);
      const fim = new Date(d);
      fim.setHours(24, 0, 0, 0);
      filtros["pagamentos.data"] = { $gte: ini, $lt: fim };
    } else if (dataInicial && dataFinal) {
      filtros["pagamentos.data"] = {
        $gte: new Date(dataInicial),
        $lte: new Date(dataFinal),
      };
    }

    // Forma (mapeando "dinheiro" -> "não informado", como já fazia)
    if (forma && forma !== "todas" && forma !== "") {
      filtros["pagamentos.forma"] =
        forma === "dinheiro" ? "não informado" : forma;
    }

    // Popula entregador e cliente para obter nomes
    const entregas = await Entrega.find(filtros)
      .populate({ path: "entregador", select: "nome" })
      .populate({ path: "cliente", select: "nome" })
      .lean();

    const pagamentos = [];
    const clientesSet = new Set();
    let totalRecebido = 0;

    for (const entrega of entregas) {
      for (const pagamento of entrega.pagamentos || []) {
        const formaDoPagamento =
          pagamento.forma === "não informado" ? "dinheiro" : pagamento.forma;

        // Filtro tardio por forma (garantia)
        if (forma && forma !== "todas" && formaDoPagamento !== forma) continue;

        // Filtro tardio por data (quando usamos dataInicial/dataFinal)
        if (filtros["pagamentos.data"]) {
          const dt = new Date(pagamento.data);
          const { $gte, $lte, $lt } = filtros["pagamentos.data"];

          // compatível com as duas modalidades
          if ($gte && dt < $gte) continue;
          if ($lte && dt > $lte) continue;
          if ($lt && dt >= $lt) continue;
        }

        pagamentos.push({
          _id: pagamento._id,
          clienteId: String(entrega.cliente?._id || entrega.cliente || ""),
          clienteNome: entrega.cliente?.nome || "Desconhecido",
          entregador: entrega.entregador?.nome || "Desconhecido",
          valor: Number(pagamento.valor) || 0,
          forma: formaDoPagamento,
          data: pagamento.data,
        });

        totalRecebido += Number(pagamento.valor) || 0;
        if (entrega.cliente)
          clientesSet.add(String(entrega.cliente?._id || entrega.cliente));
      }
    }

    // ordena mais recentes primeiro
    pagamentos.sort((a, b) => new Date(b.data) - new Date(a.data));

    res.status(200).json({
      pagamentos,
      totalRecebido,
      clientesPagantes: clientesSet.size,
      totalPendente: 0, // mantido para compatibilidade (não usamos aqui)
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
// GET /analitico/avulsas?padaria=...&mes=YYYY-MM
exports.avulsasDoMes = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req) || req.usuario?.padaria;
    if (!padariaId) return res.json({ mes: "", total: 0, avulsas: [] });

    const { ini, fim, mesStr } = mesRange(req.query.mes);
    const docs = await EntregaAvulsa.find({
      padaria: toObjectIdIfValid(padariaId),
      $or: [
        { data: { $gte: ini, $lt: fim } },
        { data: { $exists: false }, createdAt: { $gte: ini, $lt: fim } },
      ],
    })
      .populate("entregador", "nome")
      .lean();

    const avulsas = docs.map((d) => ({
      id: d._id,
      descricao: d.descricao || d.cliente || d.observacao || "Entrega avulsa",
      valor: Number(d.valor ?? d.valorTotal ?? 0),
      forma: d.forma || d.formaPagamento || "não informado",
      data: d.data || d.createdAt,
      entregador: d.entregador?.nome || null,
    }));

    const total = avulsas.reduce((s, a) => s + (a.valor || 0), 0);
    res.json({ mes: mesStr, total, avulsas });
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao listar avulsas do mês." });
  }
};
// controllers/analiticoController.js
exports.resumoFinanceiro = async (req, res) => {
  try {
    const padariaId = req.query.padaria || req.usuario?.padaria;
    if (!padariaId) {
      return res.json({
        totalRecebido: 0,
        totalPendente: 0,
        clientesPagantes: 0,
      });
    }

    const { ini, fim } = hojeRange();

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
      totalPendente += Math.max(0, esperado - pago);
      if (pago > 0 && e.cliente) clientesComPagamento.add(String(e.cliente));
    }

    res.json({
      totalRecebido,
      totalPendente,
      clientesPagantes: clientesComPagamento.size,
    });
  } catch (erro) {
    console.error("Erro em resumoFinanceiro:", erro);
    res.status(500).json({ erro: "Erro ao gerar resumo financeiro." });
  }
};
