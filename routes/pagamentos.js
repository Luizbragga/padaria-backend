const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Entrega = require("../models/Entrega");
const Cliente = require("../models/Cliente");
const {
  registrarPagamentoClienteParamsSchema,
  registrarPagamentoClienteBodySchema,
} = require("../validations/pagamentos");

/* helpers */
function mesRange(mesStr) {
  const hoje = new Date();
  const [y, m] = (
    mesStr ||
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
  )
    .split("-")
    .map(Number);
  const ini = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const fim = new Date(y, m, 1, 0, 0, 0, 0);
  return { ini, fim };
}

function sumProdutosEsperado(entrega) {
  if (!Array.isArray(entrega?.produtos)) return 0;
  return entrega.produtos.reduce((acc, p) => {
    if (typeof p?.subtotal === "number") return acc + p.subtotal;
    const qtd = Number(p?.quantidade || 0);
    const pu = Number(p?.precoUnitario || 0);
    return acc + qtd * pu;
  }, 0);
}

function sumPagamentos(entrega) {
  if (!Array.isArray(entrega?.pagamentos)) return 0;
  return entrega.pagamentos.reduce(
    (acc, pg) => acc + (Number(pg?.valor) || 0),
    0
  );
}

/**
 * POST /pagamentos/cliente/:clienteId
 * Body: { valor, forma, data?, mes? }  (mes = 'YYYY-MM', default = mês atual)
 * Regras:
 *  - Apenas admin/gerente
 *  - Distribui o pagamento pelas entregas do cliente no mês informado,
 *    na ordem cronológica, até consumir o valor.
 */
router.post(
  "/cliente/:clienteId",
  autenticar,
  autorizar("admin", "gerente", "atendente"),
  async (req, res) => {
    try {
      // valida params
      const { error: paramsError } =
        registrarPagamentoClienteParamsSchema.validate(req.params);
      if (paramsError) {
        return res.status(400).json({ erro: paramsError.details[0].message });
      }

      // valida body
      const { error: bodyError, value: validBody } =
        registrarPagamentoClienteBodySchema.validate(req.body || {});
      if (bodyError) {
        return res.status(400).json({ erro: bodyError.details[0].message });
      }

      const padariaId = req.usuario?.padaria;
      const { clienteId } = req.params;
      let { valor, forma, data, mes } = validBody;

      // Mantém a verificação original de valor para não mudar comportamento
      valor = Number(valor);
      if (!Number.isFinite(valor) || valor <= 0) {
        return res.status(400).json({ erro: "Valor inválido." });
      }

      // data do pagamento (default: agora)
      const dataPg = data ? new Date(data) : new Date();

      // garante cliente da mesma padaria
      const cliente = await Cliente.findOne({
        _id: clienteId,
        padaria: padariaId,
      }).select("_id");
      if (!cliente) {
        return res.status(404).json({ erro: "Cliente não encontrado." });
      }

      const { ini, fim } = mesRange(mes || dataPg.toISOString().slice(0, 7));

      // pega as entregas do mês (criadas/nas datas esperadas no mês)
      const entregas = await Entrega.find({
        padaria: padariaId,
        cliente: cliente._id,
        $or: [
          { createdAt: { $gte: ini, $lt: fim } },
          { dataEntrega: { $gte: ini, $lt: fim } },
          { data: { $gte: ini, $lt: fim } },
          { horaPrevista: { $gte: ini, $lt: fim } },
        ],
      }).sort({ createdAt: 1 });

      let restante = valor;
      const pagamentosCriados = [];

      for (const ent of entregas) {
        const esperado = sumProdutosEsperado(ent);
        const jaPago = sumPagamentos(ent);
        const saldo = Math.max(0, esperado - jaPago);
        if (saldo <= 0) continue;

        const usar = Math.min(restante, saldo);
        ent.pagamentos = Array.isArray(ent.pagamentos) ? ent.pagamentos : [];
        ent.pagamentos.push({
          valor: usar,
          forma: String(forma || "não informado").toLowerCase(),
          data: dataPg,
        });
        await ent.save();

        pagamentosCriados.push({ entrega: String(ent._id), valor: usar });
        restante -= usar;
        if (restante <= 0) break;
      }

      res.json({
        ok: true,
        aplicado: valor - restante,
        sobra: Math.max(0, restante),
        pagamentosCriados,
      });
    } catch (e) {
      console.error("registrar pagamento cliente:", e);
      res.status(500).json({ erro: "Falha ao registrar pagamento." });
    }
  }
);

module.exports = router;
