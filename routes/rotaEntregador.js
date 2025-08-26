// routes/rota-entregador.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Entrega = require("../models/Entrega");
const RotaEntregador = require("../models/RotaEntregador");
const logger = require("../logs/utils/logger");

// ---- helpers: range de "hoje"
function hojeRange() {
  const ini = new Date();
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini);
  fim.setDate(ini.getDate() + 1);
  return { ini, fim };
}

router.use(autenticar);

/**
 * GET /rota-entregador
 * Entregas do ENTREGADOR logado, SOMENTE de hoje e da padaria dele.
 */
router.get("/", autorizar("entregador"), async (req, res) => {
  try {
    const entregadorId = req.usuario.id;
    const padariaId = req.usuario.padaria; // segurança extra
    const { ini, fim } = hojeRange();

    const entregas = await Entrega.find({
      padaria: padariaId,
      entregador: entregadorId,
      entregue: { $in: [false, null] },
      $or: [
        { createdAt: { $gte: ini, $lt: fim } },
        { dataEntrega: { $gte: ini, $lt: fim } },
        { data: { $gte: ini, $lt: fim } },
        { horaPrevista: { $gte: ini, $lt: fim } },
      ],
    })
      .populate("cliente", "nome rota")
      .lean();

    logger.info(`📦 ENTREGAS DE HOJE (${req.usuario.nome}):`, entregas.length);
    res.json(entregas);
  } catch (err) {
    logger.error("🛑 ERRO AO BUSCAR ENTREGAS:", err);
    res.status(500).json({ erro: "Erro ao buscar entregas." });
  }
});

/**
 * PATCH /rota-entregador/concluir
 * Finaliza a rota do dia do entregador (se houver entregas concluídas).
 */
router.patch("/concluir", autorizar("entregador"), async (req, res) => {
  try {
    const entregadorId = req.usuario.id;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    logger.info("🧪 ID Entregador:", entregadorId);
    logger.info(
      "📅 HOJE:",
      hoje.toISOString(),
      "📅 AMANHÃ:",
      amanha.toISOString()
    );

    // rota do dia (se o seu schema usar outro campo de data, ajuste aqui)
    const rota = await RotaEntregador.findOne({
      entregadorId: new mongoose.Types.ObjectId(entregadorId),
      data: { $gte: hoje, $lt: amanha },
    });

    if (!rota) {
      return res.status(404).json({ erro: "Rota do dia não encontrada." });
    }

    // entregas do dia do entregador
    const entregas = await Entrega.find({
      entregador: new mongoose.Types.ObjectId(entregadorId),
      createdAt: { $gte: hoje, $lt: amanha },
    });

    logger.info("📦 ENTREGAS DO DIA:", entregas.length);

    if (!entregas || entregas.length === 0) {
      return res
        .status(400)
        .json({ erro: "Nenhuma entrega encontrada para hoje." });
    }

    const concluidas = entregas.filter((e) => e.entregue === true);
    if (concluidas.length === 0) {
      return res.status(400).json({
        erro: "Nenhuma entrega concluída. Rota não pode ser finalizada.",
      });
    }

    const fimRota = new Date();

    // usa o início que existir no seu schema (fallbacks)
    const inicioBase =
      rota.inicioRota || rota.claimedAt || rota.createdAt || hoje;
    const tempoTotal = Math.max(
      0,
      Math.floor((fimRota - new Date(inicioBase)) / 60000)
    );

    const entregasTotais = entregas.length;
    const entregasConcluidas = concluidas.length;
    const pagamentosRecebidos = entregas.filter((e) => e.pago === true).length;
    const problemasReportados = entregas.filter(
      (e) => e.problemas && e.problemas.length > 0
    ).length;

    await RotaEntregador.updateOne(
      { _id: rota._id },
      {
        $set: {
          fimRota,
          tempoTotalMinutos: tempoTotal,
          entregasTotais,
          entregasConcluidas,
          pagamentosRecebidos,
          problemasReportados,
        },
      }
    );

    return res.json({
      entregador: req.usuario.nome,
      entregasTotais,
      entregasConcluidas,
      tempoTotalMinutos: tempoTotal,
      pagamentosRecebidos,
      problemasReportados,
    });
  } catch (err) {
    logger.error("🛑 ERRO AO CONCLUIR ROTA:", err);
    res.status(500).json({ erro: "Erro ao concluir a rota." });
  }
});

module.exports = router;
