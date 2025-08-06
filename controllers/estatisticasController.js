const Entrega = require("../models/Entrega");
const logger = require("../logs/utils/logger");

exports.estatisticasGerente = async (req, res) => {
  try {
    const agora = new Date();
    const hoje = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
    );
    const amanha = new Date(hoje);
    amanha.setUTCDate(hoje.getUTCDate() + 1);

    logger.info("🕒 HOJE:", hoje.toISOString());
    logger.info("🕒 AMANHÃ:", amanha.toISOString());

    const entregasHoje = await Entrega.find({
      createdAt: { $gte: hoje, $lt: amanha },
    });

    entregasHoje.forEach((e) => {
      logger.info(
        "📦 ENTREGA:",
        e._id.toString(),
        "| Criada:",
        e.createdAt.toISOString(),
        "| Entregue:",
        e.entregue,
        "| Ativa:",
        e.ativa
      );
    });

    const totalHoje = await Entrega.countDocuments({
      createdAt: { $gte: hoje, $lt: amanha },
      ativa: true,
    });
    const concluidasHoje = await Entrega.countDocuments({
      createdAt: { $gte: hoje, $lt: amanha },
      entregue: true,
      ativa: true,
    });
    const pagasHoje = await Entrega.countDocuments({
      createdAt: { $gte: hoje, $lt: amanha },
      pago: true,
      ativa: true,
    });
    const inadimplentesHoje = await Entrega.countDocuments({
      createdAt: { $gte: hoje, $lt: amanha },
      pago: false,
      ativa: true,
    });
    const entregasPagasHoje = await Entrega.find({
      createdAt: { $gte: hoje, $lt: amanha },
      ativa: true,
      pagamentos: { $exists: true, $ne: [] },
    });

    let valorTotalRecebido = 0;

    entregasPagasHoje.forEach((entrega) => {
      entrega.pagamentos.forEach((pagamento) => {
        const data = new Date(pagamento.data);
        if (data >= hoje && data < amanha) {
          valorTotalRecebido += pagamento.valor || 0;
        }
      });
    });
    const totalEntregasComProblemaHoje = await Entrega.countDocuments({
      createdAt: { $gte: hoje, $lt: amanha },
      problemas: {
        $elemMatch: {
          data: { $gte: hoje, $lt: amanha },
        },
      },
    });

    res.json({
      totalEntregasHoje: totalHoje,
      totalEntregasConcluidas: concluidasHoje,
      totalEntregasPagas: pagasHoje,
      totalInadimplentes: inadimplentesHoje,
      valorTotalRecebidoHoje: valorTotalRecebido,
      totalEntregasComProblemaHoje,
    });
  } catch (error) {
    res.status(500).json({
      mensagem: "Erro ao buscar estatísticas do gerente",
      erro: error.message,
    });
  }
};
