// routes/rotaEntregador.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

const Entrega = require("../models/Entrega");
const RotaEntregador = require("../models/RotaEntregador");
const logger = require("../logs/utils/logger");

// --- helpers: faixa de "hoje" (00:00 -> 24:00 local)
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
 * Lista as entregas do ENTREGADOR logado, SOMENTE de hoje (createdAt) e da padaria dele,
 * com cliente populado incluindo location.
 */
router.get("/", autorizar("entregador"), async (req, res) => {
  try {
    const entregadorId = req.usuario.id;
    const padariaId = req.usuario.padaria;
    const { ini, fim } = hojeRange();

    const entregas = await Entrega.find({
      padaria: padariaId,
      entregador: new mongoose.Types.ObjectId(entregadorId),
      entregue: { $in: [false, null] },
      createdAt: { $gte: ini, $lt: fim },
    })
      .populate("cliente", "nome rota endereco location observacoes")
      .lean();

    logger.info(`📦 Entregas pendentes de hoje: ${entregas.length}`);
    return res.json(entregas);
  } catch (err) {
    logger.error("🛑 ERRO ao buscar entregas do entregador:", err);
    return res.status(500).json({ erro: "Erro ao buscar entregas." });
  }
});

/**
 * PATCH /rota-entregador/concluir
 * (inalterado, apenas mantido aqui)
 */
router.patch("/concluir", autorizar("entregador"), async (req, res) => {
  try {
    const entregadorId = req.usuario.id;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    const rota = await RotaEntregador.findOne({
      entregadorId: new mongoose.Types.ObjectId(entregadorId),
      data: { $gte: hoje, $lt: amanha },
    });

    if (!rota) {
      return res.status(404).json({ erro: "Rota do dia não encontrada." });
    }

    const entregas = await Entrega.find({
      entregador: new mongoose.Types.ObjectId(entregadorId),
      createdAt: { $gte: hoje, $lt: amanha },
    });

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
    const inicioBase =
      rota.inicioRota || rota.claimedAt || rota.createdAt || hoje;
    const tempoTotalMinutos = Math.max(
      0,
      Math.floor((fimRota - new Date(inicioBase)) / 60000)
    );

    const entregasTotais = entregas.length;
    const entregasConcluidas = concluidas.length;
    const pagamentosRecebidos = entregas.filter((e) => e.pago === true).length;
    const problemasReportados = entregas.filter(
      (e) => Array.isArray(e.problemas) && e.problemas.length > 0
    ).length;

    await RotaEntregador.updateOne(
      { _id: rota._id },
      {
        $set: {
          fimRota,
          tempoTotalMinutos,
          entregasTotais,
          entregasConcluidas,
          pagamentosRecebidos,
          problemasReportados,
        },
      }
    );

    return res.json({
      entregadorId,
      entregasTotais,
      entregasConcluidas,
      tempoTotalMinutos,
      pagamentosRecebidos,
      problemasReportados,
    });
  } catch (err) {
    logger.error("🛑 ERRO ao concluir rota do entregador:", err);
    return res.status(500).json({ erro: "Erro ao concluir a rota." });
  }
});

module.exports = router;
