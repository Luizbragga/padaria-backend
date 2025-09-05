// padaria-backend/routes/dev.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Entrega = require("../models/Entrega");

// POST /dev/wipe-pagamentos
// Body:
//  - (opcional) mes: "YYYY-MM"  -> remove apenas pagamentos desse mês
//  - (opcional p/ admin) padariaId: "<id>"  -> caso admin queira outra padaria
router.post(
  "/wipe-pagamentos",
  autenticar,
  autorizar("admin", "gerente"),
  async (req, res) => {
    try {
      const role = req.usuario?.role;
      // gerente limpa a PRÓPRIA padaria; admin pode passar ?padariaId no body
      let padariaId =
        role === "admin"
          ? req.body.padariaId || req.query.padaria
          : req.usuario?.padaria;

      if (!padariaId) {
        return res.status(400).json({ erro: "Padaria não informada." });
      }

      const padaria = mongoose.Types.ObjectId.isValid(padariaId)
        ? new mongoose.Types.ObjectId(padariaId)
        : padariaId;

      const mes = (req.body.mes || "").trim(); // "2025-09" ou vazio

      // Se veio "mes", removemos APENAS pagamentos daquele mês.
      if (mes) {
        const [yy, mm] = mes.split("-").map(Number);
        if (!yy || !mm) {
          return res
            .status(400)
            .json({ erro: "Formato de 'mes' inválido. Use YYYY-MM." });
        }
        const ini = new Date(Date.UTC(yy, mm - 1, 1, 0, 0, 0, 0));
        const fim = new Date(Date.UTC(yy, mm, 1, 0, 0, 0, 0));

        const entregas = await Entrega.find({
          padaria,
          "pagamentos.0": { $exists: true },
          "pagamentos.data": { $gte: ini, $lt: fim },
        });

        let removidos = 0;
        for (const e of entregas) {
          const before = e.pagamentos.length;
          e.pagamentos = (e.pagamentos || []).filter(
            (p) => !(p?.data >= ini && p?.data < fim)
          );
          e.pago = (e.pagamentos || []).length > 0;
          await e.save();
          removidos += before - e.pagamentos.length;
        }

        return res.json({
          ok: true,
          mes,
          docsAlterados: entregas.length,
          pagamentosRemovidos: removidos,
        });
      }

      // Sem "mes": limpa TODOS os pagamentos da padaria (zerar geral)
      const r = await Entrega.updateMany(
        { padaria, "pagamentos.0": { $exists: true } },
        { $set: { pagamentos: [], pago: false } }
      );

      return res.json({
        ok: true,
        zeradoGeral: true,
        docsAlterados: r.modifiedCount,
      });
    } catch (e) {
      console.error("wipe-pagamentos:", e);
      res
        .status(500)
        .json({ erro: "Falha ao limpar pagamentos.", detalhes: e.message });
    }
  }
);

module.exports = router;
