// controllers/analiticoController.js
const mongoose = require("mongoose");
const Entrega = require("../models/Entrega");
const Usuario = require("../models/Usuario");
const ConfigPadaria = require("../models/ConfigPadaria");
const Cliente = require("../models/Cliente");
const EntregaAvulsa = require("../models/EntregaAvulsa");
const ClienteAjustePontual = require("../models/ClienteAjustePontual");

// ——— helpers
const toObjectIdIfValid = (v) =>
  mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

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

// ===== AJUSTES PONTUAIS =====
const somaItensAjuste = (itens = []) =>
  (Array.isArray(itens) ? itens : []).reduce((acc, it) => {
    const qtd = Number(it?.quantidade || 0);
    const preco =
      it?.produto && typeof it.produto === "object"
        ? Number(it.produto.preco) || 0
        : Number(it.preco) || 0;
    return acc + qtd * preco;
  }, 0);

function buildAjusteMap(ajustesDocs = []) {
  // Map<clienteId, Map<ISOdia, ajuste>>
  const map = new Map();
  for (const aj of ajustesDocs) {
    const cid = String(aj.cliente);
    const d = new Date(aj.data);
    d.setHours(0, 0, 0, 0);
    const keyDia = d.toISOString();
    if (!map.has(cid)) map.set(cid, new Map());
    map.get(cid).set(keyDia, aj);
  }
  return map;
}

function previstoPorClienteNoPeriodoComAjustes(
  cli,
  baseIni,
  baseFim,
  mapAjustes
) {
  const normaliza00 = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const iCiclo = cli.inicioCicloFaturamento
    ? normaliza00(cli.inicioCicloFaturamento)
    : null;
  const iCriacao = cli.createdAt ? normaliza00(cli.createdAt) : null;

  const start = new Date(
    Math.max(
      baseIni.getTime(),
      iCiclo ? iCiclo.getTime() : baseIni.getTime(),
      iCriacao ? iCriacao.getTime() : baseIni.getTime()
    )
  );

  let previsto = 0;
  if (start < baseFim) {
    const ajustesDoCliente = mapAjustes?.get(String(cli._id));
    iterateDays(start, baseFim, (d) => {
      const keyDia = d.toISOString();
      const keySemana = diaKeyFromDate(d);
      let doPadrao = somaListaDoDia(cli?.padraoSemanal?.[keySemana] || []);

      const ajuste = ajustesDoCliente?.get(keyDia);
      if (ajuste) {
        const somaAjuste = somaItensAjuste(ajuste.itens || []);
        doPadrao =
          ajuste.tipo === "replace" ? somaAjuste : doPadrao + somaAjuste;
      }
      previsto += doPadrao;
    });
  }
  return round2(previsto);
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
exports.inadimplencia = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req);
    if (!padariaId) return res.json({ pagantes: 0, inadimplentes: 0 });

    // pega início do mês selecionado (ou do mês atual)
    const { ini } = mesRange(req.query.mes);

    // helpers UTC: comparar só a data para não “puxar” 01/M para M-1
    const iniUTC = Date.UTC(
      ini.getUTCFullYear(),
      ini.getUTCMonth(),
      ini.getUTCDate()
    );
    const toUTCDate = (val) => {
      const d = new Date(val);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    };

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
      const esperado = sumProdutosEsperado(e);

      // soma apenas o que foi pago ANTES de ini
      let pagoAntesIni = 0;
      for (const p of e.pagamentos || []) {
        if (toUTCDate(p.data) < iniUTC) pagoAntesIni += Number(p.valor) || 0;
      }

      const diff = Math.max(0, esperado - pagoAntesIni);
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
exports.entregasPorEntregador = async (req, res) => {
  try {
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
          _id: "$entregador",
          totalEntregas: { $sum: 1 },
          entregues: { $sum: { $cond: ["$entregue", 1, 0] } },
          pendentes: { $sum: { $cond: ["$entregue", 0, 1] } },
        },
      },
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
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          entregadorId: "$_id",
          entregador: { $ifNull: ["$entregadorInfo.nome", "Sem entregador"] },
          totalEntregas: 1,
          entregues: 1,
          pendentes: 1,
        },
      },
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
// Implementa: Previsto/Pago/Pendente do mês + "Em atraso" (meses anteriores),
// com corte no dia 8 do mês seguinte a cada mês de origem.
exports.aReceberMensal = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req) || req.usuario?.padaria;
    if (!padariaId) {
      return res.status(400).json({ erro: "Padaria não informada." });
    }

    const { ini, fim, mesStr } = mesRange(req.query.mes); // mês selecionado [ini, fim)
    const padaria = toObjectIdIfValid(padariaId);

    // Data de referência para a regra do dia 8 (pode simular no Postman com ?ref=YYYY-MM-DD)
    const ref = req.query.ref ? new Date(req.query.ref) : new Date();
    ref.setHours(0, 0, 0, 0);

    // ===== 0) CORTE GLOBAL: primeiro mês com movimento (entrega, pagamento ou avulsa)
    const [minEntregaDoc] = await Entrega.find({ padaria })
      .sort({ createdAt: 1 })
      .limit(1)
      .select("createdAt")
      .lean();

    const minPagamentoAgg = await Entrega.aggregate([
      { $match: { padaria, "pagamentos.0": { $exists: true } } },
      { $unwind: "$pagamentos" },
      { $group: { _id: null, minData: { $min: "$pagamentos.data" } } },
      { $project: { _id: 0, minData: 1 } },
    ]);

    const minAvulsaAgg = await EntregaAvulsa.aggregate([
      { $match: { padaria } },
      { $addFields: { dataRef: { $ifNull: ["$data", "$createdAt"] } } },
      { $group: { _id: null, minData: { $min: "$dataRef" } } },
      { $project: { _id: 0, minData: 1 } },
    ]);

    const datas = [
      minEntregaDoc?.createdAt,
      minPagamentoAgg[0]?.minData,
      minAvulsaAgg[0]?.minData,
    ]
      .filter(Boolean)
      .map((d) => new Date(d).getTime());

    const primeiroMovTS = datas.length ? Math.min(...datas) : null;
    const primeiroMovIniMes =
      primeiroMovTS !== null
        ? new Date(
            new Date(primeiroMovTS).getFullYear(),
            new Date(primeiroMovTS).getMonth(),
            1,
            0,
            0,
            0,
            0
          )
        : null;

    // Se não houve movimento algum OU o mês selecionado termina <= 1º mês c/ movimento → zera
    if (primeiroMovTS === null || fim <= (primeiroMovIniMes ?? fim)) {
      const clientesZero = await Cliente.find({ padaria })
        .select("nome rota")
        .lean();

      const clientesOutZero = (clientesZero || []).map((c) => ({
        cliente: String(c._id),
        nome: c.nome || "",
        rota: c.rota || "",
        previsto: 0,
        pago: 0,
        pendente: 0,
      }));

      return res.json({
        mes: mesStr,
        previstoMes: 0,
        previstoMesAtual: 0,
        pagoMes: 0,
        pendenteAtual: 0,
        pendenciaAnterior: 0, // compat (reflete apenas mês anterior; aqui 0)
        emAtrasoTotal: 0,
        emAtrasoPorMes: [],
        totalAReceber: 0,
        clientes: clientesOutZero,
      });
    }

    // ===== 1) Carrega clientes (p/ previsto via padrão semanal)
    const clientes = await Cliente.find({ padaria })
      .populate(POP_PADRAO)
      .select("nome rota padraoSemanal inicioCicloFaturamento createdAt")
      .lean();

    const clienteIds = clientes.map((c) => c._id);

    // Ajustes pontuais do mês selecionado e do mês anterior
    const ajustesAtualDocs = await ClienteAjustePontual.find({
      padaria,
      cliente: { $in: clienteIds },
      data: { $gte: ini, $lt: fim },
    })
      .select("cliente data tipo itens")
      .populate("itens.produto", "preco")
      .lean();
    const mapAjusteAtual = buildAjusteMap(ajustesAtualDocs);

    const prevIni = new Date(ini);
    prevIni.setMonth(prevIni.getMonth() - 1);
    const prevFim = new Date(ini);

    const ajustesAntDocs = await ClienteAjustePontual.find({
      padaria,
      cliente: { $in: clienteIds },
      data: { $gte: prevIni, $lt: prevFim },
    })
      .select("cliente data tipo itens")
      .populate("itens.produto", "preco")
      .lean();
    const mapAjusteAnterior = buildAjusteMap(ajustesAntDocs);

    // ===== 2) MÊS SELECIONADO: previsto/pago/pendente POR CLIENTE (com ajustes)
    const previstoMesPorCliente = new Map();
    for (const cli of clientes) {
      previstoMesPorCliente.set(
        String(cli._id),
        previstoPorClienteNoPeriodoComAjustes(cli, ini, fim, mapAjusteAtual)
      );
    }

    const entregasComPagamentoNoMes = await Entrega.find({
      padaria,
      "pagamentos.0": { $exists: true },
      "pagamentos.data": { $gte: ini, $lt: fim },
    })
      .select("cliente pagamentos")
      .lean();

    const pagoMesPorCliente = new Map();
    for (const e of entregasComPagamentoNoMes) {
      const cid = String(e.cliente || "sem-cliente");
      for (const p of e.pagamentos || []) {
        const dt = new Date(p.data);
        if (dt >= ini && dt < fim) {
          const v = Number(p?.valor) || 0;
          pagoMesPorCliente.set(
            cid,
            round2((pagoMesPorCliente.get(cid) || 0) + v)
          );
        }
      }
    }

    const clientesOut = [];
    let somaPrevistoMes = 0;
    let somaPagoRecorrenteMes = 0;
    let somaPendenteMes = 0;

    for (const cli of clientes) {
      const id = String(cli._id);
      const prev = Number(previstoMesPorCliente.get(id) || 0);
      const pago = Number(pagoMesPorCliente.get(id) || 0);
      const pend = round2(Math.max(0, prev - pago));

      clientesOut.push({
        cliente: id,
        nome: cli.nome || "",
        rota: cli.rota || "",
        previsto: prev,
        pago,
        pendente: pend,
      });

      somaPrevistoMes = round2(somaPrevistoMes + prev);
      somaPagoRecorrenteMes = round2(somaPagoRecorrenteMes + pago);
      somaPendenteMes = round2(somaPendenteMes + pend);
    }

    // Avulsas do mês (entram só no pagoMes)
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
    const pagoAvulsasMes = round2(pagoAvulsasArr[0]?.total || 0);

    // ===== 3) EM ATRASO (por mês) — todos os meses anteriores ao selecionado, com corte no dia 8
    const addMonths = (d, n) => {
      const x = new Date(d);
      x.setMonth(x.getMonth() + n);
      return x;
    };
    const monthRange = (ymStr) => {
      const [yy, mm] = ymStr.split("-").map(Number);
      const i = new Date(yy, mm - 1, 1, 0, 0, 0, 0);
      const f = new Date(yy, mm, 1, 0, 0, 0, 0);
      return { ini: i, fim: f };
    };

    const mesesAtraso = [];
    let cursor = new Date(primeiroMovIniMes);
    while (cursor < ini) {
      const ym = `${cursor.getFullYear()}-${String(
        cursor.getMonth() + 1
      ).padStart(2, "0")}`;
      const { ini: mi, fim: mf } = monthRange(ym);

      // Carrega ajustes do mês cursor
      const ajustesMesDocs = await ClienteAjustePontual.find({
        padaria,
        cliente: { $in: clienteIds },
        data: { $gte: mi, $lt: mf },
      })
        .select("cliente data tipo itens")
        .populate("itens.produto", "preco")
        .lean();
      const mapAjMes = buildAjusteMap(ajustesMesDocs);

      // previsto do mês M (com ajustes)
      let previstoM = 0;
      for (const cli of clientes) {
        previstoM += previstoPorClienteNoPeriodoComAjustes(
          cli,
          mi,
          mf,
          mapAjMes
        );
      }
      previstoM = round2(previstoM);

      // pagos recorrentes do mês M
      const pagosMAgg = await Entrega.aggregate([
        { $match: { padaria, "pagamentos.0": { $exists: true } } },
        { $unwind: "$pagamentos" },
        { $match: { "pagamentos.data": { $gte: mi, $lt: mf } } },
        { $group: { _id: null, total: { $sum: "$pagamentos.valor" } } },
        { $project: { _id: 0, total: 1 } },
      ]);
      const pagoM = round2(Number(pagosMAgg[0]?.total || 0));

      const pendenteM = round2(Math.max(0, previstoM - pagoM));

      // regra do dia 8: só conta se ref >= 8 do mês seguinte a M
      const cutoffM = addMonths(mi, 1);
      cutoffM.setDate(8);
      cutoffM.setHours(0, 0, 0, 0);
      const liberado = ref >= cutoffM;

      mesesAtraso.push({
        mes: ym,
        previsto: previstoM,
        pago: pagoM,
        pendente: pendenteM,
        liberado,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    const emAtrasoTotal = round2(
      mesesAtraso.filter((m) => m.liberado).reduce((s, m) => s + m.pendente, 0)
    );

    // Compat: "pendenciaAnterior" agora reflete apenas o MÊS IMEDIATAMENTE ANTERIOR (e só se liberado)
    const prevYM = `${prevIni.getFullYear()}-${String(
      prevIni.getMonth() + 1
    ).padStart(2, "0")}`;
    const prevRow = mesesAtraso.find((m) => m.mes === prevYM);
    const pendenciaAnterior =
      prevRow && prevRow.liberado ? prevRow.pendente : 0;

    // ===== 4) Totais finais / resposta
    const previstoMesAtual = somaPrevistoMes; // só o mês selecionado
    const pendenteAtual = somaPendenteMes; // só o mês selecionado
    const pagoMes = round2(somaPagoRecorrenteMes + pagoAvulsasMes);
    const totalAReceber = round2(pendenteAtual + emAtrasoTotal);

    return res.json({
      mes: mesStr,
      previstoMes: previstoMesAtual, // limpo, sem atrasados
      previstoMesAtual, // (mantido p/ conferência/compat)
      pagoMes, // recorrentes + avulsas
      pendenteAtual, // só mês selecionado
      pendenciaAnterior, // COMPAT: apenas mês imediatamente anterior (com regra dia 8)
      emAtrasoTotal, // soma de todos os meses liberados
      emAtrasoPorMes: mesesAtraso, // [{mes, previsto, pago, pendente, liberado}]
      totalAReceber, // pendenteAtual + emAtrasoTotal
      clientes: clientesOut, // por cliente (mês selecionado)
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
    })
      .populate("entregador", "nome")
      .populate("cliente", "nome");

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
    })
      .select("_id nome rotaAtual localizacaoAtual")
      .lean();

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
      .populate({ path: "cliente", select: "nome rota location" })
      .populate({ path: "entregador", select: "nome" })
      .select(
        "cliente entregador entregue pago produtos createdAt entregueEm problemas"
      )
      .lean();

    res.json(entregasDeHoje);
  } catch (erro) {
    console.error("Erro ao buscar entregas tempo real:", erro);
    res.status(500).json({ erro: "Erro interno ao buscar entregas." });
  }
};

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
      totalPendente: 0, // compatibilidade
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: "Erro ao buscar pagamentos detalhados" });
  }
};

// /analitico/resumo-financeiro (mantida a versão correta)
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

    const padaria = toObjectIdIfValid(padariaId);
    const { ini, fim } = hojeRange();

    // 1) Entregas criadas HOJE (para pendência do dia)
    // 2) Entregas com PAGAMENTO HOJE (para totalRecebido)
    const [entregasCriadasHoje, entregasComPagamentoHoje] = await Promise.all([
      Entrega.find({ padaria, createdAt: { $gte: ini, $lt: fim } })
        .select("produtos pagamentos cliente")
        .lean(),
      Entrega.find({ padaria, "pagamentos.data": { $gte: ini, $lt: fim } })
        .select("pagamentos cliente")
        .lean(),
    ]);

    // totalRecebido = soma dos pagamentos com data hoje
    let totalRecebido = 0;
    const clientesComPagamento = new Set();
    for (const e of entregasComPagamentoHoje) {
      for (const p of e.pagamentos || []) {
        const d = new Date(p.data);
        if (d >= ini && d < fim) {
          totalRecebido += Number(p.valor) || 0;
          if (e.cliente) clientesComPagamento.add(String(e.cliente));
        }
      }
    }

    // totalPendente = (previsto - pago) das entregas criadas hoje
    let totalPendente = 0;
    for (const e of entregasCriadasHoje) {
      const esperado = sumProdutosEsperado(e);
      const pago = sumPagamentos(e);
      totalPendente += Math.max(0, esperado - pago);
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

// /analitico/notificacoes-recentes
exports.notificacoesRecentes = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req) || req.usuario?.padaria;
    if (!padariaId) return res.json({ eventos: [] });

    const padaria = toObjectIdIfValid(padariaId);
    const { ini, fim } = hojeRange();

    // 1) Pagamentos HOJE (traz updatedAt para fallback de horário)
    const pagDocs = await Entrega.find({
      padaria,
      "pagamentos.data": { $gte: ini, $lt: fim },
    })
      .select("cliente pagamentos updatedAt")
      .populate("cliente", "nome")
      .lean();

    // 2) Problemas HOJE
    const probDocs = await Entrega.find({
      padaria,
      "problemas.data": { $gte: ini, $lt: fim },
    })
      .select("cliente problemas")
      .populate("cliente", "nome")
      .lean();

    // 3) Entregas concluídas HOJE (usa entregueEm)
    const conclDocs = await Entrega.find({
      padaria,
      entregue: true,
      entregueEm: { $ne: null, $gte: ini, $lt: fim },
    })
      .select("cliente entregueEm")
      .populate("cliente", "nome")
      .lean();

    const eventos = [];

    // ---- Pagamentos
    for (const e of pagDocs) {
      for (const p of e.pagamentos || []) {
        const dt = new Date(p.data);
        if (dt >= ini && dt < fim) {
          const isDateOnly =
            dt.getUTCHours() === 0 &&
            dt.getUTCMinutes() === 0 &&
            dt.getUTCSeconds() === 0;
          const horario = isDateOnly && e.updatedAt ? e.updatedAt : p.data;

          eventos.push({
            id: `${e._id}-pg-${p._id}`,
            cliente: e.cliente,
            tipo: "Pagamento",
            horario,
          });
        }
      }
    }

    // ---- Problemas
    for (const e of probDocs) {
      for (const pr of e.problemas || []) {
        const d = new Date(pr.data);
        if (d >= ini && d < fim) {
          eventos.push({
            id: `${e._id}-pr-${pr._id}`,
            cliente: e.cliente,
            tipo: "Problema",
            horario: pr.data,
          });
        }
      }
    }

    // ---- Entregas concluídas
    for (const e of conclDocs) {
      eventos.push({
        id: `${e._id}-ok`,
        cliente: e.cliente,
        tipo: "Entrega realizada",
        horario: e.entregueEm,
      });
    }

    // ===== Deduplicação de PAGAMENTOS por (cliente + minuto)
    const pagamentosPorChave = new Map();
    const outrosEventos = [];

    for (const ev of eventos) {
      const isPagamento = String(ev.tipo || "")
        .toLowerCase()
        .includes("pagamento");

      if (!isPagamento) {
        outrosEventos.push(ev);
        continue;
      }

      const clienteId =
        ev?.cliente && typeof ev.cliente === "object"
          ? String(ev.cliente._id || ev.cliente.id || "")
          : String(ev.cliente || "");

      const d = new Date(ev.horario);
      if (Number.isNaN(d.getTime())) {
        outrosEventos.push(ev);
        continue;
      }

      d.setSeconds(0, 0);
      const key = `${clienteId}|${d.toISOString()}`;

      const atual = pagamentosPorChave.get(key);
      if (!atual || new Date(ev.horario) > new Date(atual.horario)) {
        pagamentosPorChave.set(key, ev);
      }
    }

    const compactados = [...outrosEventos, ...pagamentosPorChave.values()];
    compactados.sort((a, b) => new Date(b.horario) - new Date(a.horario));
    return res.json({ eventos: compactados.slice(0, 20) });
  } catch (erro) {
    return res.status(500).json({
      erro: "Erro ao buscar notificações recentes",
      detalhes: erro.message,
    });
  }
};

// GET /analitico/pendencias-anuais?padaria=...&ano=2025&gracaDia=8
// Retorna, para cada mês do ano, o valor em atraso (apenas se "liberado" após o dia 8 do mês seguinte)
// e a quantidade de clientes em atraso. Ignora meses anteriores ao primeiro movimento.
exports.pendenciasAnuais = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req) || req.usuario?.padaria;
    if (!padariaId)
      return res.status(400).json({ erro: "Padaria não informada." });

    const ano = Number(req.query.ano) || new Date().getFullYear();
    const gracaDia = Math.min(31, Math.max(1, Number(req.query.gracaDia) || 8));
    const padaria = toObjectIdIfValid(padariaId);

    // Descobre o 1º mês com movimento (entrega criada, pagamento ou avulsa)
    const [minEntregaDoc] = await Entrega.find({ padaria })
      .sort({ createdAt: 1 })
      .limit(1)
      .select("createdAt")
      .lean();

    const minPagamentoAgg = await Entrega.aggregate([
      { $match: { padaria, "pagamentos.0": { $exists: true } } },
      { $unwind: "$pagamentos" },
      { $group: { _id: null, minData: { $min: "$pagamentos.data" } } },
      { $project: { _id: 0, minData: 1 } },
    ]);

    const minAvulsaAgg = await EntregaAvulsa.aggregate([
      { $match: { padaria } },
      { $addFields: { dataRef: { $ifNull: ["$data", "$createdAt"] } } },
      { $group: { _id: null, minData: { $min: "$dataRef" } } },
      { $project: { _id: 0, minData: 1 } },
    ]);

    const datas = [
      minEntregaDoc?.createdAt,
      minPagamentoAgg[0]?.minData,
      minAvulsaAgg[0]?.minData,
    ]
      .filter(Boolean)
      .map((d) => new Date(d).getTime());

    const primeiroMovTS = datas.length ? Math.min(...datas) : null;
    const primeiroMovIniMes =
      primeiroMovTS !== null
        ? new Date(
            new Date(primeiroMovTS).getFullYear(),
            new Date(primeiroMovTS).getMonth(),
            1,
            0,
            0,
            0,
            0
          )
        : null;

    // Carrega clientes (com padrão semanal) uma vez
    const clientes = await Cliente.find({ padaria })
      .populate(POP_PADRAO)
      .select("nome rota padraoSemanal inicioCicloFaturamento createdAt")
      .lean();
    const clienteIds = clientes.map((c) => c._id);

    const mesesOut = [];
    const hoje = new Date();

    for (let m = 0; m < 12; m++) {
      const ini = new Date(ano, m, 1, 0, 0, 0, 0);
      const fim = new Date(ano, m + 1, 1, 0, 0, 0, 0);

      // Se não houve nenhum movimento ainda (base histórica) e este mês termina antes/igual ao 1º mês com movimento → zera
      if (primeiroMovTS === null || fim <= (primeiroMovIniMes ?? fim)) {
        mesesOut.push({
          mes: `${ano}-${String(m + 1).padStart(2, "0")}`,
          previsto: 0,
          pago: 0,
          pendente: 0,
          clientesEmAtraso: 0,
          emAtraso: 0,
          liberado: true,
        });
        continue;
      }

      // Ajustes do mês m
      const ajustesDocs = await ClienteAjustePontual.find({
        padaria,
        cliente: { $in: clienteIds },
        data: { $gte: ini, $lt: fim },
      })
        .select("cliente data tipo itens")
        .populate("itens.produto", "preco")
        .lean();
      const mapAjustes = buildAjusteMap(ajustesDocs);

      // Previsto do mês (com ajustes)
      let previstoMes = 0;
      const previstoMesPorCliente = new Map();
      for (const cli of clientes) {
        const prev = previstoPorClienteNoPeriodoComAjustes(
          cli,
          ini,
          fim,
          mapAjustes
        );
        previstoMesPorCliente.set(String(cli._id), prev);
        previstoMes += prev;
      }
      previstoMes = round2(previstoMes);

      // Pago recorrente no mês
      const entregasPagasMes = await Entrega.find({
        padaria,
        "pagamentos.0": { $exists: true },
        "pagamentos.data": { $gte: ini, $lt: fim },
      })
        .select("cliente pagamentos")
        .lean();

      const pagoMesPorCliente = new Map();
      let pagoMes = 0;
      for (const e of entregasPagasMes) {
        const cid = String(e.cliente || "sem-cliente");
        for (const p of e.pagamentos || []) {
          const d = new Date(p.data);
          if (d >= ini && d < fim) {
            const v = Number(p.valor) || 0;
            pagoMesPorCliente.set(
              cid,
              round2((pagoMesPorCliente.get(cid) || 0) + v)
            );
            pagoMes = round2(pagoMes + v);
          }
        }
      }

      // Pendente por cliente e totais
      let pendenteMes = 0;
      let clientesAtraso = 0;
      for (const cli of clientes) {
        const cid = String(cli._id);
        const prev = Number(previstoMesPorCliente.get(cid) || 0);
        const pag = Number(pagoMesPorCliente.get(cid) || 0);
        const pend = round2(Math.max(0, prev - pag));
        if (pend > 0) {
          pendenteMes = round2(pendenteMes + pend);
          clientesAtraso++;
        }
      }

      // Regra de liberação (apenas aparece como "em atraso" depois do dia X do mês seguinte)
      const corte = new Date(ano, m + 1, gracaDia, 0, 0, 0, 0); // dia 8 do mês seguinte (default)
      const liberado = hoje >= corte; // se já passou do corte, contabiliza como atraso

      mesesOut.push({
        mes: `${ano}-${String(m + 1).padStart(2, "0")}`,
        previsto: previstoMes,
        pago: pagoMes,
        pendente: pendenteMes,
        clientesEmAtraso: liberado ? clientesAtraso : 0,
        emAtraso: liberado ? pendenteMes : 0,
        liberado,
      });
    }

    return res.json({ ano, gracaDia, meses: mesesOut });
  } catch (erro) {
    console.error("Erro em pendenciasAnuais:", erro);
    return res.status(500).json({ erro: "Erro ao gerar pendências anuais." });
  }
};

// GET /analitico/pendencias-do-mes?padaria=...&mes=YYYY-MM&gracaDia=8
// Lista clientes pendentes no mês selecionado + flag 'liberado' conforme regra do dia 8.
exports.pendenciasDoMes = async (req, res) => {
  try {
    const padariaId = getPadariaFromReq(req) || req.usuario?.padaria;
    if (!padariaId)
      return res.status(400).json({ erro: "Padaria não informada." });

    const { ini, fim, mesStr } = mesRange(req.query.mes);
    const ano = ini.getFullYear();
    const mesIndex = ini.getMonth(); // 0..11
    const gracaDia = Math.min(31, Math.max(1, Number(req.query.gracaDia) || 8));
    const padaria = toObjectIdIfValid(padariaId);

    // Descobre 1º mês com movimento para não mostrar dados antes do histórico real
    const [minEntregaDoc] = await Entrega.find({ padaria })
      .sort({ createdAt: 1 })
      .limit(1)
      .select("createdAt")
      .lean();
    const primeiroMovTS = minEntregaDoc?.createdAt
      ? new Date(minEntregaDoc.createdAt).getTime()
      : null;
    const primeiroMovIniMes =
      primeiroMovTS !== null
        ? new Date(
            new Date(primeiroMovTS).getFullYear(),
            new Date(primeiroMovTS).getMonth(),
            1,
            0,
            0,
            0,
            0
          )
        : null;
    if (primeiroMovTS === null || fim <= (primeiroMovIniMes ?? fim)) {
      return res.json({
        mes: mesStr,
        liberado: true,
        clientes: [],
        totalPendente: 0,
        clientesEmAtraso: 0,
      });
    }

    const clientes = await Cliente.find({ padaria })
      .populate(POP_PADRAO)
      .select("nome rota padraoSemanal inicioCicloFaturamento createdAt")
      .lean();

    const clienteIds = clientes.map((c) => c._id);

    // Ajustes do mês selecionado
    const ajustesDocs = await ClienteAjustePontual.find({
      padaria,
      cliente: { $in: clienteIds },
      data: { $gte: ini, $lt: fim },
    })
      .select("cliente data tipo itens")
      .populate("itens.produto", "preco")
      .lean();
    const mapAjustes = buildAjusteMap(ajustesDocs);

    // Previsto mês por cliente (com ajustes)
    const previstoMesPorCliente = new Map();
    for (const cli of clientes) {
      previstoMesPorCliente.set(
        String(cli._id),
        previstoPorClienteNoPeriodoComAjustes(cli, ini, fim, mapAjustes)
      );
    }

    // Pago mês por cliente
    const entregasPagasMes = await Entrega.find({
      padaria,
      "pagamentos.0": { $exists: true },
      "pagamentos.data": { $gte: ini, $lt: fim },
    })
      .select("cliente pagamentos")
      .lean();

    const pagoMesPorCliente = new Map();
    for (const e of entregasPagasMes) {
      const cid = String(e.cliente || "sem-cliente");
      for (const p of e.pagamentos || []) {
        const d = new Date(p.data);
        if (d >= ini && d < fim) {
          const v = Number(p.valor) || 0;
          pagoMesPorCliente.set(
            cid,
            round2((pagoMesPorCliente.get(cid) || 0) + v)
          );
        }
      }
    }

    // Liberação
    const hoje = new Date();
    const corte = new Date(ano, mesIndex + 1, gracaDia, 0, 0, 0, 0);
    const liberado = hoje >= corte;

    // Monta saída
    const clientesOut = [];
    let totalPendente = 0;
    let clientesEmAtraso = 0;

    for (const cli of clientes) {
      const cid = String(cli._id);
      const prev = Number(previstoMesPorCliente.get(cid) || 0);
      const pag = Number(pagoMesPorCliente.get(cid) || 0);
      const pend = round2(Math.max(0, prev - pag));
      if (pend > 0) {
        clientesEmAtraso++;
        totalPendente = round2(totalPendente + pend);
        clientesOut.push({
          cliente: cid,
          nome: cli.nome || "",
          rota: cli.rota || "",
          pendente: pend,
        });
      }
    }

    // ordena por maior pendência
    clientesOut.sort((a, b) => b.pendente - a.pendente);

    return res.json({
      mes: mesStr,
      liberado,
      clientes: liberado ? clientesOut : [], // se ainda não liberou, lista vem vazia
      totalPendente: liberado ? totalPendente : 0,
      clientesEmAtraso: liberado ? clientesEmAtraso : 0,
    });
  } catch (erro) {
    console.error("Erro em pendenciasDoMes:", erro);
    return res.status(500).json({ erro: "Erro ao listar pendências do mês." });
  }
};
