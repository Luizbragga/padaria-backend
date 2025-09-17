// padaria-backend/routes/rotasSplitHoje.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const autenticacao = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

const Cliente = require("../models/Cliente");
const RotaOverride = require("../models/RotaOverride");

function dataHojeLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ===== Algoritmo simples de split =====
   - calcula “centro” (média) das paradas de A e C
   - para cada ponto da B: envia para o centro mais próximo
   - se houver capA/capC, tenta balancear “peso” (volume=1)
*/
function centroid(stops) {
  if (!stops.length) return null;
  const s = stops.reduce(
    (a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: s.lat / stops.length, lng: s.lng / stops.length };
}
function dist2(a, b) {
  const dx = a.lat - b.lat;
  const dy = a.lng - b.lng;
  return dx * dx + dy * dy;
}
function splitRouteB({ A, B, C, capA, capC }) {
  const cA = centroid(A.length ? A : B); // fallback: se A vazio, usa B
  const cC = centroid(C.length ? C : B);
  if (!cA || !cC) {
    return { paraA: B, paraC: [] }; // fallback tosco
  }

  const paraA = [];
  const paraC = [];
  let cargaA = 0;
  let cargaC = 0;

  for (const p of B) {
    const da = dist2(p, cA);
    const dc = dist2(p, cC);

    // respeita “capacidade” se informada
    if (typeof capA === "number" && typeof capC === "number") {
      if (da <= dc) {
        if (cargaA + 1 <= capA || cargaC + 1 > capC) {
          paraA.push(p);
          cargaA += 1;
        } else {
          paraC.push(p);
          cargaC += 1;
        }
      } else {
        if (cargaC + 1 <= capC || cargaA + 1 > capA) {
          paraC.push(p);
          cargaC += 1;
        } else {
          paraA.push(p);
          cargaA += 1;
        }
      }
    } else {
      // sem capacidade: puramente o mais próximo
      (da <= dc ? paraA : paraC).push(p);
    }
  }

  return {
    paraA,
    paraC,
    resumo: { qtdParaA: paraA.length, qtdParaC: paraC.length },
  };
}

// normaliza cliente -> ponto
function toPoint(c) {
  const loc = c.location || c.geo || c.posicao || {};
  const lat = Number(loc.lat ?? c.lat);
  const lng = Number(loc.lng ?? c.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(c._id),
    lat,
    lng,
    nome: c.nome,
    rota: (c.rota || "").toUpperCase(),
  };
}

// ==== Protegido: gerente/admin ====
router.use(autenticacao, autorizar("admin", "gerente"));

/**
 * POST /rotas-split/simular
 * body: { rotaAlvo:"B", paraA:"A", paraC:"C", capA?:number, capC?:number }
 */
router.post("/simular", async (req, res) => {
  try {
    const padariaId = req.usuario?.padaria || req.query.padaria;
    if (!padariaId)
      return res.status(400).json({ erro: "Padaria não informada" });

    const { rotaAlvo, paraA, paraC, capA, capC } = req.body || {};
    const R0 = String(rotaAlvo || "").toUpperCase();
    const RA = String(paraA || "").toUpperCase();
    const RC = String(paraC || "").toUpperCase();
    if (!R0 || !RA || !RC)
      return res.status(400).json({ erro: "Informe rotaAlvo, paraA e paraC" });

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    const [clientesA, clientesB, clientesC] = await Promise.all([
      Cliente.find({ padaria, rota: RA }).lean(),
      Cliente.find({ padaria, rota: R0 }).lean(),
      Cliente.find({ padaria, rota: RC }).lean(),
    ]);

    const A = clientesA.map(toPoint).filter(Boolean);
    const B = clientesB.map(toPoint).filter(Boolean);
    const C = clientesC.map(toPoint).filter(Boolean);

    const caps = {};
    if (capA !== undefined && capA !== null && String(capA) !== "")
      caps.capA = Number(capA);
    if (capC !== undefined && capC !== null && String(capC) !== "")
      caps.capC = Number(capC);

    const out = splitRouteB({ A, B, C, ...caps });

    return res.json(out);
  } catch (e) {
    console.error("simular split:", e);
    res.status(500).json({ erro: "Falha ao simular divisão" });
  }
});

/**
 * POST /rotas-split/aplicar
 * body: { rotaAlvo, paraA, paraC, capA?, capC? }
 * Grava overrides SÓ PARA HOJE.
 */
router.post("/aplicar", async (req, res) => {
  try {
    const padariaId = req.usuario?.padaria || req.query.padaria;
    if (!padariaId)
      return res.status(400).json({ erro: "Padaria não informada" });

    const { rotaAlvo, paraA, paraC, capA, capC } = req.body || {};
    const R0 = String(rotaAlvo || "").toUpperCase();
    const RA = String(paraA || "").toUpperCase();
    const RC = String(paraC || "").toUpperCase();
    if (!R0 || !RA || !RC)
      return res.status(400).json({ erro: "Informe rotaAlvo, paraA e paraC" });

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    // montar simulação
    const [clsA, clsB, clsC] = await Promise.all([
      Cliente.find({ padaria, rota: RA }).lean(),
      Cliente.find({ padaria, rota: R0 }).lean(),
      Cliente.find({ padaria, rota: RC }).lean(),
    ]);
    const A = clsA.map(toPoint).filter(Boolean);
    const B = clsB.map(toPoint).filter(Boolean);
    const C = clsC.map(toPoint).filter(Boolean);

    const caps = {};
    if (capA !== undefined && capA !== null && String(capA) !== "")
      caps.capA = Number(capA);
    if (capC !== undefined && capC !== null && String(capC) !== "")
      caps.capC = Number(capC);

    const {
      paraA: toA,
      paraC: toC,
      resumo,
    } = splitRouteB({ A, B, C, ...caps });

    const data = dataHojeLocal();

    // limpa overrides anteriores da rota-alvo de HOJE
    await RotaOverride.deleteMany({ padaria, data, antigaRota: R0 });

    // grava overrides (B -> A ou B -> C)
    const docs = [
      ...toA.map((p) => ({
        padaria,
        data,
        cliente: p.id,
        novaRota: RA,
        antigaRota: R0,
      })),
      ...toC.map((p) => ({
        padaria,
        data,
        cliente: p.id,
        novaRota: RC,
        antigaRota: R0,
      })),
    ];
    if (docs.length) await RotaOverride.insertMany(docs, { ordered: false });

    res.json({ ok: true, resumo, gravados: docs.length });
  } catch (e) {
    console.error("aplicar split:", e);
    res.status(500).json({ erro: "Falha ao aplicar divisão" });
  }
});

/** DELETE /rotas-split/limpar?rota=B  -> remove overrides de hoje para a rota-alvo */
router.delete("/limpar", async (req, res) => {
  try {
    const padariaId = req.usuario?.padaria || req.query.padaria;
    if (!padariaId)
      return res.status(400).json({ erro: "Padaria não informada" });

    const rota = String(req.query.rota || req.body?.rota || "").toUpperCase();
    if (!rota) return res.status(400).json({ erro: "Informe a rota alvo" });

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    const data = dataHojeLocal();
    const r = await RotaOverride.deleteMany({
      padaria,
      data,
      antigaRota: rota,
    });
    res.json({ ok: true, removidos: r?.deletedCount || 0 });
  } catch (e) {
    console.error("limpar split:", e);
    res.status(500).json({ erro: "Falha ao limpar divisão" });
  }
});

/** GET /rotas-split/status  -> lista overrides de hoje */
router.get("/status", async (req, res) => {
  try {
    const padariaId = req.usuario?.padaria || req.query.padaria;
    if (!padariaId)
      return res.status(400).json({ erro: "Padaria não informada" });

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    const data = dataHojeLocal();
    const list = await RotaOverride.find({ padaria, data })
      .populate("cliente", "nome rota")
      .lean();

    const resumo = {};
    for (const o of list) {
      const k = `${o.antigaRota}->${o.novaRota}`;
      resumo[k] = (resumo[k] || 0) + 1;
    }
    res.json({ overrides: list, resumo });
  } catch (e) {
    console.error("status split:", e);
    res.status(500).json({ erro: "Falha ao consultar status" });
  }
});

module.exports = router;
