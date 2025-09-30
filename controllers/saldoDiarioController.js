const mongoose = require("mongoose");
const SaldoDiario = require("../models/SaldoDiario");

const toId = (v) =>
  mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v;

function normalizarData(dStr) {
  const d = dStr ? new Date(dStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolverPadaria(req) {
  const role = req?.usuario?.role;
  if (role === "admin") {
    const q = req.query?.padaria;
    if (!q) {
      const err = new Error("Para admin, informe ?padaria=<id>.");
      err.status = 400;
      throw err;
    }
    return toId(q);
  }
  if (role === "gerente") {
    if (!req.usuario?.padaria) {
      const err = new Error("Usuário gerente sem padaria.");
      err.status = 400;
      throw err;
    }
    return toId(req.usuario.padaria);
  }
  const err = new Error("Acesso negado. (somente admin/gerente)");
  err.status = 403;
  throw err;
}

function resumo(doc) {
  const gastos = (doc.batches || []).reduce(
    (s, b) => s + (Number(b.custoTotal) || 0),
    0
  );
  const faturamento = (doc.vendas || []).reduce(
    (s, v) => s + (Number(v.precoVenda) || 0),
    0
  );
  const lucro = faturamento - gastos;
  return {
    data: doc.data,
    gastos,
    faturamento,
    lucro,
  };
}

async function getOrCreate(padaria, data) {
  const d = normalizarData(data);
  let doc = await SaldoDiario.findOne({ padaria: toId(padaria), data: d });
  if (!doc) {
    doc = await SaldoDiario.create({
      padaria: toId(padaria),
      data: d,
      batches: [],
      vendas: [],
    });
  }
  return doc;
}

/** GET /saldo-diario/saldo?data=YYYY-MM-DD[&padaria=] */
async function getSaldo(req, res) {
  try {
    const padaria = resolverPadaria(req);
    const data = req.query?.data;
    const doc = await getOrCreate(padaria, data);
    res.json({
      ...resumo(doc),
      batches: doc.batches.map((b) => ({
        _id: b._id,
        tipo: b.tipo,
        produto: b.produto,
        quantidade: b.quantidade,
        custoTotal: b.custoTotal,
        precoSugerido: b.precoSugerido ?? null,
        vendidos: b.vendidos || 0,
      })),
      vendas: doc.vendas.map((v) => ({
        _id: v._id,
        batchId: v.batchId,
        produto: v.produto,
        precoVenda: v.precoVenda,
        custoUnitario: v.custoUnitario,
        dataHora: v.dataHora,
      })),
    });
  } catch (e) {
    console.error("getSaldo:", e);
    res
      .status(e.status || 500)
      .json({ erro: e.message || "Erro ao buscar saldo." });
  }
}

/** POST /saldo-diario/lote  body: { data, tipo, produto, quantidade, custoTotal, precoSugerido } */
async function criarLote(req, res) {
  try {
    const padaria = resolverPadaria(req);
    const {
      data,
      tipo,
      produto,
      quantidade = 1,
      custoTotal = 0,
      precoSugerido,
    } = req.body || {};

    if (!tipo || !["compra", "producao"].includes(tipo))
      return res
        .status(400)
        .json({ erro: "tipo deve ser 'compra' ou 'producao'." });
    if (!produto || typeof produto !== "string")
      return res.status(400).json({ erro: "produto é obrigatório." });

    const q = Math.max(1, Number(quantidade) || 1);
    const custo = Math.max(0, Number(custoTotal) || 0);

    const doc = await getOrCreate(padaria, data);
    doc.batches.push({
      tipo,
      produto: produto.trim(),
      quantidade: q,
      custoTotal: custo,
      precoSugerido: precoSugerido != null ? Number(precoSugerido) : undefined,
      vendidos: 0,
    });
    await doc.save();
    res.json({ ok: true, saldo: resumo(doc), batch: doc.batches.at(-1) });
  } catch (e) {
    console.error("criarLote:", e);
    res
      .status(e.status || 500)
      .json({ erro: e.message || "Erro ao criar lote." });
  }
}

/** POST /saldo-diario/vender  body: { data, batchId, precoVenda, quantidade=1 } */
async function registrarVenda(req, res) {
  try {
    const padaria = resolverPadaria(req);
    const { data, batchId, precoVenda, quantidade = 1 } = req.body || {};
    if (!batchId)
      return res.status(400).json({ erro: "batchId é obrigatório." });

    const doc = await getOrCreate(padaria, data);
    const b = doc.batches.id(batchId);
    if (!b) return res.status(404).json({ erro: "Lote não encontrado." });

    const qtd = Math.max(1, Number(quantidade) || 1);
    const disponivel = Math.max(0, (b.quantidade || 0) - (b.vendidos || 0));
    const efetiva = Math.min(qtd, disponivel);
    if (efetiva <= 0) {
      return res.status(400).json({ erro: "Lote já está totalmente vendido." });
    }

    const custoUnit =
      (Number(b.custoTotal) || 0) / Math.max(1, Number(b.quantidade) || 1);

    const pVenda = Number(
      precoVenda != null ? precoVenda : b.precoSugerido || 0
    );
    if (!Number.isFinite(pVenda) || pVenda < 0) {
      return res.status(400).json({ erro: "precoVenda inválido." });
    }

    for (let i = 0; i < efetiva; i++) {
      doc.vendas.push({
        batchId: b._id,
        produto: b.produto,
        precoVenda: pVenda,
        custoUnitario: custoUnit,
      });
    }
    b.vendidos = (b.vendidos || 0) + efetiva;

    await doc.save();
    res.json({
      ok: true,
      saldo: resumo(doc),
      batch: b,
      vendasAdicionadas: efetiva,
    });
  } catch (e) {
    console.error("registrarVenda:", e);
    res
      .status(e.status || 500)
      .json({ erro: e.message || "Erro ao registrar venda." });
  }
}

async function atualizarVenda(req, res) {
  try {
    const padaria = resolverPadaria(req);
    const { id } = req.params;
    const { data, precoVenda, custoUnitario } = req.body || {};

    const doc = await getOrCreate(padaria, data);
    const v = doc.vendas.id(id);
    if (!v) return res.status(404).json({ erro: "Venda não encontrada." });

    if (precoVenda != null) {
      const pv = Number(precoVenda);
      if (!Number.isFinite(pv) || pv < 0)
        return res.status(400).json({ erro: "precoVenda inválido." });
      v.precoVenda = pv;
    }
    if (custoUnitario != null) {
      const cu = Number(custoUnitario);
      if (!Number.isFinite(cu) || cu < 0)
        return res.status(400).json({ erro: "custoUnitario inválido." });
      v.custoUnitario = cu;
    }

    await doc.save();
    return res.json({ ok: true, venda: v, saldo: resumo(doc) });
  } catch (e) {
    console.error("atualizarVenda:", e);
    res
      .status(e.status || 500)
      .json({ erro: e.message || "Erro ao atualizar venda." });
  }
}

async function excluirVenda(req, res) {
  try {
    const padaria = resolverPadaria(req);
    const { id } = req.params;
    const { data } = req.query; // ou body

    const doc = await getOrCreate(padaria, data);
    const v = doc.vendas.id(id);
    if (!v) return res.status(404).json({ erro: "Venda não encontrada." });

    if (v.batchId) {
      const b = doc.batches.id(v.batchId);
      if (b) b.vendidos = Math.max(0, Number(b.vendidos || 0) - 1);
    }

    v.deleteOne();
    await doc.save();

    return res.json({ ok: true, saldo: resumo(doc) });
  } catch (e) {
    console.error("excluirVenda:", e);
    res
      .status(e.status || 500)
      .json({ erro: e.message || "Erro ao excluir venda." });
  }
}

module.exports = {
  getSaldo,
  criarLote,
  registrarVenda,
  atualizarVenda,
  excluirVenda,
};
