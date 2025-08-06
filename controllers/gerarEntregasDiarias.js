const Cliente = require("../models/Cliente");
const Entrega = require("../models/Entrega");
const Produto = require("../models/Produto");
const logger = require("../logs/utils/logger");

function diaDaSemanaAtual() {
  const dias = [
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
  ];
  return dias[new Date().getDay()];
}

exports.gerarEntregasDoDia = async () => {
  const dataExecucao = new Date().toISOString();
  const diaSemana = diaDaSemanaAtual();

  logger.info(
    `[${dataExecucao}] 🚚 Iniciando geração de entregas do dia (${diaSemana})`
  );

  try {
    const clientes = await Cliente.find({
      ativo: true,
      [`padraoSemanal.${diaSemana}`]: { $exists: true, $ne: [] },
    });

    if (clientes.length === 0) {
      logger.info(
        `[${dataExecucao}] Nenhum cliente com entregas agendadas para hoje.`
      );
      return;
    }

    const entregasCriadas = [];

    for (const cliente of clientes) {
      const pedidosDoDia = cliente.padraoSemanal[diaSemana];

      // Verifica se já existe entrega para hoje
      const jaExisteEntrega = await Entrega.findOne({
        cliente: cliente._id,
        createdAt: {
          $gte: new Date().setHours(0, 0, 0, 0),
          $lt: new Date().setHours(23, 59, 59, 999),
        },
      });
      if (jaExisteEntrega) {
        logger.warn(
          `[${dataExecucao}] Entrega já existente para cliente ${cliente.nome}`
        );
        continue;
      }

      // Montar produtos com nome, preco e subtotal do dia
      const produtosDetalhados = [];

      for (const item of pedidosDoDia) {
        const produto = await Produto.findById(item.produto);
        if (!produto) {
          logger.warn(`[${dataExecucao}] Produto ID inválido: ${item.produto}`);
          continue;
        }

        const quantidade = item.quantidade;
        const precoUnitario = produto.preco;
        const subtotal = precoUnitario * quantidade;

        produtosDetalhados.push({
          nome: produto.nome,
          quantidade,
          precoUnitario,
          subtotal,
        });
      }

      if (produtosDetalhados.length === 0) continue;

      const novaEntrega = new Entrega({
        cliente: cliente._id,
        endereco: cliente.endereco,
        entregador: null,
        produtos: produtosDetalhados,
        entregue: false,
        pago: false,
        pagamentos: [],
        problemas: [],
        padaria: cliente.padaria,
        location: cliente.location,
      });

      const entregaSalva = await novaEntrega.save();
      entregasCriadas.push(entregaSalva);
    }

    logger.info(
      `[${dataExecucao}] ✅ Entregas geradas com sucesso: ${entregasCriadas.length}`
    );
  } catch (erro) {
    logger.error(
      `[${dataExecucao}] ❌ Erro ao gerar entregas: ${erro.message}`
    );
  }
};
