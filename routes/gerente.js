// routes/gerente.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Entrega = require("../models/Entrega");
const Usuario = require("../models/Usuario");

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const logger = require("../logs/utils/logger");

// util: normaliza início/fim do dia (local)
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Determina padaria alvo: admin pode informar via query ?padaria=...
function resolvePadariaId(req) {
  const role = req?.usuario?.role;
  if (role === "admin") {
    const q = String(req.query.padaria || "").trim();
    if (q && mongoose.Types.ObjectId.isValid(q))
      return new mongoose.Types.ObjectId(q);
    // se admin não passar, cai para a padaria do token se existir (opcional),
    // senão não filtra por padaria
    if (
      req.usuario.padaria &&
      mongoose.Types.ObjectId.isValid(req.usuario.padaria)
    ) {
      return new mongoose.Types.ObjectId(req.usuario.padaria);
    }
    return null; // admin sem filtro: vê tudo
  }
  // gerente: SEMPRE limitado à sua padaria
  if (
    !req.usuario.padaria ||
    !mongoose.Types.ObjectId.isValid(req.usuario.padaria)
  ) {
    return null;
  }
  return new mongoose.Types.ObjectId(req.usuario.padaria);
}

// -----------------------------------------------------------------------------
// GET /gerente/entregas
// Lista entregas com filtros (cliente, status, data, entregador), SEMPRE
// respeitando o escopo da padaria (gerente: apenas sua; admin: opcional por query)
// -----------------------------------------------------------------------------
router.get(
  "/entregas",
  autenticar,
  autorizar("gerente", "admin"),
  async (req, res) => {
    try {
      const padariaId = resolvePadariaId(req);
      const filtro = {};

      // escopo por padaria (admin sem filtro vê tudo; gerente é sempre limitado)
      if (padariaId) filtro.padaria = padariaId;
      if (req.usuario.role === "gerente" && !padariaId) {
        return res.status(403).json({ erro: "Gerente sem padaria vinculada." });
      }

      // filtros opcionais
      if (typeof req.query.entregue !== "undefined") {
        filtro.entregue = req.query.entregue === "true";
      }

      if (req.query.entregador) {
        if (!mongoose.Types.ObjectId.isValid(req.query.entregador)) {
          return res.status(400).json({ erro: "entregador inválido." });
        }
        filtro.entregador = new mongoose.Types.ObjectId(req.query.entregador);
      }

      // filtro por data única (YYYY-MM-DD)
      if (req.query.data) {
        const d = new Date(req.query.data);
        if (isNaN(d)) return res.status(400).json({ erro: "data inválida." });
        filtro.createdAt = { $gte: startOfDay(d), $lt: endOfDay(d) };
      } else if (req.query.inicio && req.query.fim) {
        // intervalo inclusivo
        const ini = new Date(req.query.inicio);
        const fim = new Date(req.query.fim);
        if (isNaN(ini) || isNaN(fim)) {
          return res.status(400).json({ erro: "intervalo de datas inválido." });
        }
        filtro.createdAt = { $gte: startOfDay(ini), $lt: endOfDay(fim) };
      }

      const entregas = await Entrega.find(filtro).populate(
        "entregador",
        "nome"
      );

      // mapeia resposta amigável
      const resultado = entregas.map((entrega) => {
        const totalPago = Array.isArray(entrega.pagamentos)
          ? entrega.pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0)
          : 0;

        const quantidadeProdutos = Array.isArray(entrega.produtos)
          ? entrega.produtos.reduce(
              (s, p) => s + (Number(p.quantidade) || 0),
              0
            )
          : 0;

        return {
          _id: entrega._id,
          cliente: entrega.cliente,
          endereco: entrega.endereco,
          entregador: entrega.entregador?.nome || "Desconhecido",
          entregue: !!entrega.entregue,
          pago: !!entrega.pago,
          totalPago,
          problemas: entrega.problemas || [],
          quantidadeProdutos,
          createdAt: entrega.createdAt,
        };
      });

      res.json(resultado);
    } catch (err) {
      logger.error("Erro ao buscar entregas:", err);
      res.status(500).json({ erro: "Erro ao buscar entregas." });
    }
  }
);

// -----------------------------------------------------------------------------
// GET /gerente/entregadores
// Ranking/estatísticas por entregador da padaria (sem N+1).
// Gerente: somente sua padaria. Admin: pode filtrar ?padaria=...
// -----------------------------------------------------------------------------
router.get(
  "/entregadores",
  autenticar,
  autorizar("gerente", "admin"),
  async (req, res) => {
    try {
      const padariaId = resolvePadariaId(req);
      if (req.usuario.role === "gerente" && !padariaId) {
        return res.status(403).json({ erro: "Gerente sem padaria vinculada." });
      }

      // Limita lista de entregadores à padaria (se houver)
      const baseFiltroUsuarios = { role: "entregador" };
      if (padariaId) baseFiltroUsuarios.padaria = padariaId;

      const entregadores = await Usuario.find(baseFiltroUsuarios, { senha: 0 })
        .select("_id nome email")
        .lean();

      if (entregadores.length === 0) {
        return res.json([]); // sem entregadores no escopo
      }

      const entregadorIds = entregadores.map((u) => u._id);

      // Agregação única nas entregas para evitar N+1
      const matchEntregas = { entregador: { $in: entregadorIds } };
      if (padariaId) matchEntregas.padaria = padariaId;

      const stats = await Entrega.aggregate([
        { $match: matchEntregas },
        {
          $project: {
            entregador: 1,
            entregue: 1,
            produtos: { $ifNull: ["$produtos", []] },
            pagamentos: { $ifNull: ["$pagamentos", []] },
            problemas: { $ifNull: ["$problemas", []] },
          },
        },
        // flattens controlados + somatórios
        {
          $addFields: {
            totalProdutos: {
              $sum: {
                $map: {
                  input: "$produtos",
                  as: "p",
                  in: { $ifNull: ["$$p.quantidade", 0] },
                },
              },
            },
            totalPagoEntrega: {
              $sum: {
                $map: {
                  input: "$pagamentos",
                  as: "pg",
                  in: { $ifNull: ["$$pg.valor", 0] },
                },
              },
            },
            qtdProblemasEntrega: { $size: "$problemas" },
          },
        },
        {
          $group: {
            _id: "$entregador",
            totalEntregas: { $sum: 1 },
            concluidas: {
              $sum: { $cond: [{ $eq: ["$entregue", true] }, 1, 0] },
            },
            pagamentosRecebidos: { $sum: "$totalPagoEntrega" },
            produtosEntregues: { $sum: "$totalProdutos" },
            problemasRelatados: { $sum: "$qtdProblemasEntrega" },
          },
        },
      ]);

      // index auxiliar por entregadorId
      const byId = new Map(stats.map((s) => [String(s._id), s]));

      const resposta = entregadores.map((u) => {
        const s = byId.get(String(u._id)) || {
          totalEntregas: 0,
          concluidas: 0,
          pagamentosRecebidos: 0,
          produtosEntregues: 0,
          problemasRelatados: 0,
        };
        return {
          entregadorId: u._id,
          nome: u.nome,
          email: u.email,
          totalEntregas: s.totalEntregas,
          concluidas: s.concluidas,
          pagamentosRecebidos: s.pagamentosRecebidos,
          produtosEntregues: s.produtosEntregues,
          problemasRelatados: s.problemasRelatados,
        };
      });

      // ordena como ranking: maior totalEntregas primeiro
      resposta.sort((a, b) => b.totalEntregas - a.totalEntregas);

      res.json(resposta);
    } catch (err) {
      logger.error("Erro ao buscar dados dos entregadores:", err);
      res
        .status(500)
        .json({ erro: "Erro ao gerar relatório de entregadores." });
    }
  }
);

module.exports = router;
