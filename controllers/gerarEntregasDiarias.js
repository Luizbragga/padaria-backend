// services/geradorEntregasDiarias.js (ou onde você já mantém essa função)
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

// retorna o início/fim do dia em HORÁRIO LOCAL (00:00:00.000 — 23:59:59.999)
function intervaloHojeLocal() {
  const ini = new Date();
  ini.setHours(0, 0, 0, 0); // Date válido
  const fim = new Date(ini);
  fim.setDate(ini.getDate() + 1);
  return { ini, fim };
}

exports.gerarEntregasDoDia = async () => {
  const startedAt = new Date();
  const dataExecucao = startedAt.toISOString();
  const diaSemana = diaDaSemanaAtual();
  const { ini, fim } = intervaloHojeLocal();

  logger.info(
    `[${dataExecucao}] 🚚 Iniciando geração de entregas do dia (${diaSemana})`
  );

  try {
    // 1) Busca clientes ativos que têm padrão no dia da semana
    const clientes = await Cliente.find({
      ativo: true,
      [`padraoSemanal.${diaSemana}`]: { $exists: true, $ne: [] },
    })
      .select("_id nome endereco padaria location padraoSemanal")
      .lean();

    if (!clientes.length) {
      logger.info(
        `[${dataExecucao}] Nenhum cliente com entregas agendadas para hoje.`
      );
      return;
    }

    // 2) Filtra clientes sem coordenadas (obrigatório)
    const clientesValidos = clientes.filter((c) => {
      const lat = c?.location?.lat;
      const lng = c?.location?.lng;
      const ok =
        typeof lat === "number" &&
        typeof lng === "number" &&
        !Number.isNaN(lat) &&
        !Number.isNaN(lng);
      if (!ok) {
        logger.warn(
          `[${dataExecucao}] Cliente "${c.nome}" sem location válido (lat/lng). Pulando.`
        );
      }
      return ok;
    });

    if (!clientesValidos.length) {
      logger.info(
        `[${dataExecucao}] Todos os clientes elegíveis estão sem coordenadas. Nada a gerar.`
      );
      return;
    }

    // 3) Carrega IDs de produtos que serão usados hoje (para evitar N+1)
    const todosItensDoDia = clientesValidos.flatMap(
      (c) => c.padraoSemanal?.[diaSemana] || []
    );
    const productIds = [
      ...new Set(
        todosItensDoDia.map((i) => String(i.produto || "")).filter((id) => !!id)
      ),
    ];

    const produtos = await Produto.find({ _id: { $in: productIds } })
      .select("_id nome preco")
      .lean();

    const mapaProdutos = new Map(
      produtos.map((p) => [String(p._id), { nome: p.nome, preco: p.preco }])
    );

    let criadas = 0;

    // 4) Para cada cliente: verificar se já tem entrega hoje; senão, criar
    for (const cliente of clientesValidos) {
      // 4.1) Já existe uma entrega para este cliente hoje?
      const jaExiste = await Entrega.exists({
        cliente: cliente._id,
        createdAt: { $gte: ini, $lt: fim },
      });

      if (jaExiste) {
        logger.warn(
          `[${dataExecucao}] Entrega já existente hoje para cliente ${cliente.nome} (${cliente._id}).`
        );
        continue;
      }

      // 4.2) Montar itens do pedido (nome, preço unitário, subtotal)
      const itensDia = cliente.padraoSemanal?.[diaSemana] || [];
      const produtosDetalhados = [];

      for (const item of itensDia) {
        const pid = String(item.produto || "");
        const meta = mapaProdutos.get(pid);
        if (!meta) {
          logger.warn(
            `[${dataExecucao}] Produto não encontrado/ativo para ID: ${pid} (cliente: ${cliente.nome}). Pulando item.`
          );
          continue;
        }
        const quantidade = Number(item.quantidade || 0);
        if (!Number.isFinite(quantidade) || quantidade <= 0) continue;

        const precoUnitario = Number(meta.preco || 0);
        const subtotal = precoUnitario * quantidade;

        produtosDetalhados.push({
          nome: meta.nome,
          quantidade,
          precoUnitario,
          subtotal,
        });
      }

      if (!produtosDetalhados.length) {
        logger.warn(
          `[${dataExecucao}] Cliente ${cliente.nome} sem itens válidos hoje. Pulando.`
        );
        continue;
      }

      // 4.3) Cria a entrega (uma por cliente/dia com todos os itens)
      await Entrega.create({
        cliente: cliente._id,
        endereco: cliente.endereco,
        entregador: null, // será atribuído ao assumir rota
        produtos: produtosDetalhados,
        entregue: false,
        pago: false,
        pagamentos: [],
        problemas: [],
        padaria: cliente.padaria,
        location: cliente.location, // obrigatório e já validado acima
      });

      criadas += 1;
    }

    logger.info(
      `[${dataExecucao}] ✅ Entregas geradas com sucesso: ${criadas}`
    );
  } catch (erro) {
    logger.error(
      `[${dataExecucao}] ❌ Erro ao gerar entregas: ${erro.message}`
    );
  }
};
