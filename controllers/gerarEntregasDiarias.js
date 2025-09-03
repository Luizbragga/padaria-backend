// controllers/gerarEntregasDiarias.js
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

// Retorna início/fim do dia em HORÁRIO LOCAL (00:00 — 24:00)
function intervaloHojeLocal() {
  const ini = new Date();
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini);
  fim.setDate(ini.getDate() + 1);
  return { ini, fim };
}

async function gerarEntregasDoDia() {
  const startedAt = new Date();
  const dataExecucao = startedAt.toISOString();
  const diaSemana = diaDaSemanaAtual();
  const { ini, fim } = intervaloHojeLocal();

  logger.info(
    `[${dataExecucao}] 🚚 Iniciando geração de entregas do dia (${diaSemana})`
  );

  try {
    // 1) Clientes ativos com padrão hoje
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

    // 2) Filtra clientes sem coordenadas válidas
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

    // 3) Carrega produtos do dia (evita N+1)
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

    // 4) Para cada cliente: evita duplicata e cria a entrega
    for (const cliente of clientesValidos) {
      // 4.1) Já existe entrega hoje para este cliente?
      const jaExiste = await Entrega.exists({
        cliente: cliente._id,
        createdAt: { $gte: ini, $lt: fim },
      });
      if (jaExiste) {
        logger.warn(
          `[${dataExecucao}] Entrega já existente hoje para ${cliente.nome} (${cliente._id}).`
        );
        continue;
      }

      // 4.2) Monta itens
      const itensDia = cliente.padraoSemanal?.[diaSemana] || [];
      const produtosDetalhados = [];
      for (const item of itensDia) {
        const pid = String(item.produto || "");
        const meta = mapaProdutos.get(pid);
        if (!meta) {
          logger.warn(
            `[${dataExecucao}] Produto ausente/ativo p/ ID: ${pid} (cliente: ${cliente.nome}). Pulando item.`
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
        cliente: cliente._id, // ⚠️ seu modelo aceita ObjectId ou string; aqui padronizamos ObjectId
        endereco: cliente.endereco,
        entregador: null, // atribuído ao assumir a rota
        produtos: produtosDetalhados,
        entregue: false,
        pago: false,
        pagamentos: [],
        problemas: [],
        padaria: cliente.padaria,
        location: cliente.location, // já validado
        ativa: true,
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
}

module.exports = { gerarEntregasDoDia };
