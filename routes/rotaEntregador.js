const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Entrega = require("../models/Entrega");
const RotaEntregador = require("../models/RotaEntregador");
const logger = require("../logs/utils/logger");

// GET - Ver entregas do entregador
router.get("/", autenticar, autorizar("entregador"), async (req, res) => {
  try {
    const entregadorId = req.usuario.id;
    const entregas = await Entrega.find({
      entregador: entregadorId,
      entregue: false,
    });
    logger.info("📦 ENTREGAS ENCONTRADAS:", entregas);
    res.json(entregas);
  } catch (err) {
    logger.error("🛑 ERRO AO BUSCAR ENTREGAS:", err);
    res.status(500).json({ erro: "Erro ao buscar entregas." });
  }
});

// PATCH - Concluir rota
router.patch(
  "/concluir",
  autenticar,
  autorizar("entregador"),
  async (req, res) => {
    try {
      const entregadorId = req.usuario.id;

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(hoje);
      amanha.setDate(hoje.getDate() + 1);

      logger.info("🧪 ID Entregador (req.usuario.id):", entregadorId);
      logger.info("📅 HOJE:", hoje.toISOString());
      logger.info("📅 AMANHÃ:", amanha.toISOString());

      // Buscar rota do dia
      const rota = await RotaEntregador.findOne({
        entregadorId: new mongoose.Types.ObjectId(entregadorId),
        data: { $gte: hoje, $lt: amanha },
      });

      if (!rota) {
        return res.status(404).json({ erro: "Rota do dia não encontrada." });
      }

      // Buscar entregas do dia
      logger.info(
        "⏱️ FILTRANDO ENTRE createdAt >= ",
        hoje.toISOString(),
        " E <",
        amanha.toISOString()
      );
      const entregas = await Entrega.find({
        entregador: new mongoose.Types.ObjectId(entregadorId),
        createdAt: { $gte: hoje, $lt: amanha },
      });

      logger.info("📦 ENTREGAS DO DIA:", entregas);

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
      const tempoTotal = Math.floor((fimRota - rota.inicioRota) / 60000);

      rota.fimRota = fimRota;
      rota.tempoTotalMinutos = tempoTotal;
      rota.entregasTotais = entregas.length;
      rota.entregasConcluidas = concluidas.length;
      rota.pagamentosRecebidos = entregas.filter((e) => e.pago === true).length;
      rota.problemasReportados = entregas.filter(
        (e) => e.problemas && e.problemas.length > 0
      ).length;
      rota.entregadorId = new mongoose.Types.ObjectId(entregadorId);
      await RotaEntregador.updateOne(
        { _id: rota._id },
        {
          fimRota,
          tempoTotalMinutos: tempoTotal,
          entregasTotais: entregas.length,
          entregasConcluidas: concluidas.length,
          pagamentosRecebidos: entregas.filter((e) => e.pago === true).length,
          problemasReportados: entregas.filter(
            (e) => e.problemas && e.problemas.length > 0
          ).length,
        }
      );

      res.json({
        entregador: req.usuario.nome,
        entregasTotais: rota.entregasTotais,
        entregasConcluidas: rota.entregasConcluidas,
        tempoTotalMinutos: rota.tempoTotalMinutos,
        pagamentosRecebidos: rota.pagamentosRecebidos,
        problemasReportados: rota.problemasReportados,
      });
    } catch (err) {
      logger.error("🛑 ERRO AO CONCLUIR ROTA:", err);
      res.status(500).json({ erro: "Erro ao concluir a rota." });
    }
  }
);

module.exports = router;
