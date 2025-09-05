const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const ConfigPadaria = require("../models/ConfigPadaria");

const toObjId = (v) =>
  mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v;

router.use(autenticar, autorizar("admin", "gerente"));

/**
 * POST /config/iniciar-ciclo  { padariaId, inicio: 'YYYY-MM-DD' }
 */
router.post("/iniciar-ciclo", async (req, res) => {
  try {
    const { padariaId, inicio } = req.body;
    if (!padariaId || !inicio)
      return res
        .status(400)
        .json({ erro: "Informe padariaId e inicio (YYYY-MM-DD)." });

    const padaria = toObjId(padariaId);
    const inicioDate = new Date(`${inicio}T00:00:00`);

    const cfg = await ConfigPadaria.findOneAndUpdate(
      { padaria },
      { $set: { inicioCicloFaturamento: inicioDate } },
      { upsert: true, new: true }
    ).lean();

    res.json({ ok: true, config: cfg });
  } catch (e) {
    res
      .status(500)
      .json({ erro: "Falha ao iniciar ciclo.", detalhes: e.message });
  }
});

/**
 * GET /config/ciclo?padaria=<id>   (ou usa a padaria do usuário)
 */
router.get("/ciclo", async (req, res) => {
  try {
    const padariaId = req.query.padaria || req.usuario?.padaria;
    if (!padariaId) return res.json({ inicioCiclo: null });
    const cfg = await ConfigPadaria.findOne({
      padaria: toObjId(padariaId),
    }).lean();
    res.json({ inicioCiclo: cfg?.inicioCicloFaturamento ?? null });
  } catch (e) {
    res
      .status(500)
      .json({ erro: "Falha ao consultar ciclo.", detalhes: e.message });
  }
});

module.exports = router;
