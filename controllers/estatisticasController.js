// controllers/estatisticasController.js
const Entrega = require("../models/Entrega");
const logger = require("../logs/utils/logger");

exports.estatisticasGerente = async (req, res) => {
  try {
    // Janela do dia em UTC: [hoje, amanhã)
    const agora = new Date();
    const hoje = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
    );
    const amanha = new Date(hoje);
    amanha.setUTCDate(hoje.getUTCDate() + 1);

    // Filtro base: dia + ativa
    const baseMatch = {
      createdAt: { $gte: hoje, $lt: amanha },
      ativa: true,
    };

    // Se não for admin, restringe à padaria do usuário
    if (req.usuario?.role !== "admin" && req.usuario?.padaria) {
      baseMatch.padaria = req.usuario.padaria;
    }

    logger.info("🕒 HOJE:", hoje.toISOString());
    logger.info("🕒 AMANHÃ:", amanha.toISOString());
    logger.info("🔎 Filtro base estatísticas:", baseMatch);

    // Uma passada com $facet para obter tudo
    const [agg] = await Entrega.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          total: [{ $count: "c" }],
          concluidas: [{ $match: { entregue: true } }, { $count: "c" }],
          pagas: [{ $match: { pago: true } }, { $count: "c" }],
          inadimplentes: [{ $match: { pago: false } }, { $count: "c" }],
          problemas: [
            {
              $match: {
                problemas: {
                  $elemMatch: { data: { $gte: hoje, $lt: amanha } },
                },
              },
            },
            { $count: "c" },
          ],
          recebido: [
            { $match: { pagamentos: { $exists: true, $ne: [] } } },
            { $unwind: "$pagamentos" },
            {
              $match: { "pagamentos.data": { $gte: hoje, $lt: amanha } },
            },
            {
              $group: {
                _id: null,
                total: { $sum: { $ifNull: ["$pagamentos.valor", 0] } },
              },
            },
          ],
          // (opcional) logs de referência — sem custo alto
          amostras: [
            { $project: { _id: 1, createdAt: 1, entregue: 1, ativa: 1 } },
            { $limit: 5 },
          ],
        },
      },
    ]);

    // Helpers pra extrair valores com default = 0
    const pickCount = (arr) => (Array.isArray(arr) && arr[0]?.c) || 0;
    const pickTotal = (arr) =>
      Array.isArray(arr) && arr[0]?.total ? Number(arr[0].total) : 0;

    const totalEntregasHoje = pickCount(agg?.total);
    const totalEntregasConcluidas = pickCount(agg?.concluidas);
    const totalEntregasPagas = pickCount(agg?.pagas);
    const totalInadimplentes = pickCount(agg?.inadimplentes);
    const totalEntregasComProblemaHoje = pickCount(agg?.problemas);
    const valorTotalRecebidoHoje = pickTotal(agg?.recebido);

    // Logs leves (podem ajudar quando algo "não bate")
    if (agg?.amostras?.length) {
      logger.info(
        "🧪 Amostras de entregas do dia:",
        agg.amostras.map((e) => ({
          id: e._id?.toString?.() || e._id,
          createdAt: e.createdAt?.toISOString?.() || e.createdAt,
          entregue: e.entregue,
          ativa: e.ativa,
        }))
      );
    }

    return res.json({
      totalEntregasHoje,
      totalEntregasConcluidas,
      totalEntregasPagas,
      totalInadimplentes,
      valorTotalRecebidoHoje,
      totalEntregasComProblemaHoje,
    });
  } catch (error) {
    logger.error("❌ Erro em estatisticasGerente:", error);
    return res.status(500).json({
      mensagem: "Erro ao buscar estatísticas do gerente",
      erro: error.message,
    });
  }
};
