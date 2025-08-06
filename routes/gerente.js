const express = require("express");
const router = express.Router();
const Entrega = require("../models/Entrega");
const Usuario = require("../models/Usuario");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

router.get(
  "/entregas",
  autenticar,
  autorizar("gerente", "admin"),
  async (req, res) => {
    try {
      const filtros = {};

      if (req.query.entregue) {
        filtros.entregue = req.query.entregue === "true";
      }

      if (req.query.entregador) {
        filtros.entregador = req.query.entregador;
      }

      if (req.query.data) {
        const data = new Date(req.query.data);
        const proximoDia = new Date(data);
        proximoDia.setDate(data.getDate() + 1);

        filtros.createdAt = { $gte: data, $lt: proximoDia };
      } else if (req.query.inicio && req.query.fim) {
        const inicio = new Date(req.query.inicio);
        const fim = new Date(req.query.fim);
        fim.setDate(fim.getDate() + 1); // incluir o dia do fim

        filtros.createdAt = { $gte: inicio, $lt: fim };
      }

      const entregas = await Entrega.find(filtros).populate(
        "entregador",
        "nome"
      );

      const resultado = entregas.map((entrega) => {
        const totalPago = entrega.pagamentos.reduce(
          (soma, p) => soma + p.valor,
          0
        );

        return {
          cliente: entrega.cliente,
          endereco: entrega.endereco,
          entregador: entrega.entregador?.nome || "Desconhecido",
          entregue: entrega.entregue,
          pago: entrega.pago,
          totalPago,
          problemas: entrega.problemas || [],
          quantidadeProdutos: entrega.produtos.reduce(
            (soma, p) => soma + p.quantidade,
            0
          ),
        };
      });

      res.json(resultado);
    } catch (err) {
      logger.error("Erro ao buscar entregas:", err);
      res.status(500).json({ erro: "Erro ao buscar entregas." });
    }
  }
);

router.get(
  "/entregadores",
  autenticar,
  autorizar("gerente", "admin"),
  async (req, res) => {
    try {
      const entregadores = await Usuario.find({ role: "entregador" });

      const resultados = await Promise.all(
        entregadores.map(async (entregador) => {
          const entregas = await Entrega.find({ entregador: entregador._id });

          const totalEntregas = entregas.length;
          const concluidas = entregas.filter((e) => e.entregue).length;
          const pagamentos = entregas.reduce((soma, e) => {
            return soma + e.pagamentos.reduce((s, p) => s + p.valor, 0);
          }, 0);
          const totalProdutos = entregas.reduce((soma, e) => {
            return soma + e.produtos.reduce((s, p) => s + p.quantidade, 0);
          }, 0);
          const problemas = entregas.reduce(
            (soma, e) => soma + (e.problemas?.length || 0),
            0
          );

          return {
            nome: entregador.nome,
            email: entregador.email,
            totalEntregas,
            concluidas,
            pagamentosRecebidos: pagamentos,
            produtosEntregues: totalProdutos,
            problemasRelatados: problemas,
          };
        })
      );

      res.json(resultados);
    } catch (err) {
      logger.error("Erro ao buscar dados dos entregadores:", err);
      res
        .status(500)
        .json({ erro: "Erro ao gerar relatório de entregadores." });
    }
  }
);

module.exports = router;
