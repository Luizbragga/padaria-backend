const mongoose = require("mongoose");
const Entrega = require("../models/Entrega");
const Usuario = require("../models/Usuario");

exports.entregasPorDia = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          entregues: { $sum: { $cond: ["$entregue", 1, 0] } },
          naoEntregues: { $sum: { $cond: ["$entregue", 0, 1] } },
        },
      },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 0,
          data: "$_id",
          entregues: 1,
          naoEntregues: 1,
        },
      },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de entregas por dia." });
  }
};

exports.inadimplencia = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      { $match: { pago: false } },
      {
        $group: {
          _id: "$cliente",
          entregasNaoPagas: { $sum: 1 },
          valorPendente: { $sum: { $sum: "$produtos.precoTotal" } }, // revisar depois
        },
      },
      {
        $project: {
          _id: 0,
          cliente: "$_id",
          entregasNaoPagas: 1,
          valorPendente: 1,
        },
      },
      { $sort: { valorPendente: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao gerar relatório de inadimplência." });
  }
};

exports.produtosMaisEntregues = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      { $unwind: "$produtos" },
      {
        $group: {
          _id: "$produtos.nome",
          quantidadeTotal: { $sum: "$produtos.quantidade" },
        },
      },
      {
        $project: {
          _id: 0,
          produto: "$_id",
          quantidadeTotal: 1,
        },
      },
      { $sort: { quantidadeTotal: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao gerar ranking de produtos." });
  }
};

exports.entregasPorEntregador = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      {
        $group: {
          _id: "$entregador",
          totalEntregas: { $sum: 1 },
          entregues: { $sum: { $cond: ["$entregue", 1, 0] } },
          pendentes: { $sum: { $cond: ["$entregue", 0, 1] } },
        },
      },
      {
        $lookup: {
          from: "usuarios",
          localField: "_id",
          foreignField: "_id",
          as: "entregadorInfo",
        },
      },
      { $unwind: "$entregadorInfo" },
      {
        $project: {
          _id: 0,
          entregador: "$entregadorInfo.nome",
          totalEntregas: 1,
          entregues: 1,
          pendentes: 1,
        },
      },
      { $sort: { totalEntregas: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao gerar relatório de entregadores." });
  }
};

exports.problemasPorTipo = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      { $unwind: "$problemas" },
      {
        $group: {
          _id: "$problemas.tipo",
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          tipo: "$_id",
          total: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de problemas por tipo." });
  }
};

exports.problemasPorCliente = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      { $unwind: "$problemas" },
      {
        $group: {
          _id: "$cliente",
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          cliente: "$_id",
          total: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de problemas por cliente." });
  }
};

exports.formasDePagamento = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      {
        $match: {
          padaria: new mongoose.Types.ObjectId(req.usuario.padaria),
          "pagamentos.0": { $exists: true },
        },
      },
      { $unwind: "$pagamentos" },
      {
        $group: {
          _id: "$pagamentos.forma",
          quantidade: { $sum: 1 },
          valorTotal: { $sum: "$pagamentos.valor" },
        },
      },
      {
        $project: {
          _id: 0,
          forma: "$_id",
          quantidade: 1,
          valorTotal: 1,
        },
      },
      { $sort: { valorTotal: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de formas de pagamento." });
  }
};

exports.clientesPorMes = async (req, res) => {
  try {
    const resultado = await Usuario.aggregate([
      {
        $group: {
          _id: {
            mes: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          },
          novosClientes: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          mes: "$_id.mes",
          novosClientes: 1,
        },
      },
      { $sort: { mes: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao gerar relatório de clientes por mês." });
  }
};

exports.mediaProdutosPorEntrega = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      {
        $project: {
          totalProdutosEntrega: {
            $sum: "$produtos.quantidade",
          },
        },
      },
      {
        $group: {
          _id: null,
          totalEntregas: { $sum: 1 },
          totalProdutos: { $sum: "$totalProdutosEntrega" },
        },
      },
      {
        $project: {
          _id: 0,
          totalEntregas: 1,
          totalProdutos: 1,
          mediaPorEntrega: {
            $cond: [
              { $eq: ["$totalEntregas", 0] },
              0,
              { $divide: ["$totalProdutos", "$totalEntregas"] },
            ],
          },
        },
      },
    ]);
    res.json(
      resultado[0] || {
        totalEntregas: 0,
        totalProdutos: 0,
        mediaPorEntrega: 0,
      }
    );
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao calcular média de produtos por entrega." });
  }
};

exports.faturamentoMensal = async (req, res) => {
  try {
    const resultado = await Entrega.aggregate([
      {
        $match: {
          "pagamentos.0": { $exists: true },
          padaria: new mongoose.Types.ObjectId(req.usuario.padaria),
        },
      },
      { $unwind: "$pagamentos" },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$pagamentos.data" },
          },
          totalPago: { $sum: "$pagamentos.valor" },
          entregasPagas: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          _id: 0,
          mes: "$_id",
          totalPago: 1,
          entregasPagas: { $size: "$entregasPagas" },
          mediaPorEntrega: {
            $cond: [
              { $eq: [{ $size: "$entregasPagas" }, 0] },
              0,
              { $divide: ["$totalPago", { $size: "$entregasPagas" }] },
            ],
          },
        },
      },
      { $sort: { mes: -1 } },
    ]);
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao calcular faturamento mensal." });
  }
};

exports.resumoFinanceiro = async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    const entregasDoDia = await Entrega.find({
      padaria: req.usuario.padaria,
      createdAt: { $gte: hoje, $lt: amanha },
    });

    const total = entregasDoDia.length;
    const pagas = entregasDoDia.filter((e) => e.pago).length;
    const pendentes = total - pagas;

    const totalRecebido = entregasDoDia.reduce((soma, entrega) => {
      if (entrega.pagamentos?.length > 0) {
        entrega.pagamentos.forEach((p) => {
          if (p.valor && !isNaN(p.valor)) {
            soma += p.valor;
          }
        });
      }
      return soma;
    }, 0);

    res.json({ total, pagas, pendentes, totalRecebido });
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao gerar resumo financeiro." });
  }
};

exports.entregasPorPadaria = async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    const resultado = await Entrega.aggregate([
      {
        $match: {
          createdAt: { $gte: hoje, $lt: amanha },
        },
      },
      {
        $lookup: {
          from: "padarias",
          localField: "padaria",
          foreignField: "_id",
          as: "padariaInfo",
        },
      },
      { $unwind: "$padariaInfo" },
      {
        $group: {
          _id: "$padaria",
          nomePadaria: { $first: "$padariaInfo.nome" },
          entregasHoje: { $sum: 1 },
          totalRecebidoHoje: {
            $sum: {
              $sum: {
                $map: {
                  input: "$pagamentos",
                  as: "p",
                  in: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$$p.data", hoje] },
                          { $lt: ["$$p.data", amanha] },
                        ],
                      },
                      "$$p.valor",
                      0,
                    ],
                  },
                },
              },
            },
          },
          totalPendenteHoje: {
            $sum: {
              $cond: [{ $eq: ["$pago", false] }, 1, 0],
            },
          },
        },
      },
      { $sort: { nomePadaria: 1 } },
    ]);

    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao buscar dados por padaria." });
  }
};

exports.entregasPorDiaDaSemana = async (req, res) => {
  try {
    const pipeline = [
      {
        $match: {
          padaria: req.usuario.padaria,
        },
      },
      {
        $addFields: {
          diaSemana: { $dayOfWeek: "$createdAt" },
        },
      },
      {
        $group: {
          _id: "$diaSemana",
          total: { $sum: 1 },
        },
      },
    ];

    const resultados = await Entrega.aggregate(pipeline);

    const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const dadosOrdenados = Array(7)
      .fill(0)
      .map((_, i) => {
        const item = resultados.find((r) => r._id === i + 1);
        return { dia: dias[i], total: item ? item.total : 0 };
      });

    res.json(dadosOrdenados);
  } catch (error) {
    res.status(500).json({ mensagem: "Erro na análise", erro: error.message });
  }
};

exports.listarEntregasDoDia = async (req, res) => {
  try {
    const agora = new Date();
    const inicioDoDia = new Date(agora.setHours(0, 0, 0, 0));
    const fimDoDia = new Date(agora.setHours(23, 59, 59, 999));

    const entregas = await Entrega.find({
      createdAt: { $gte: inicioDoDia, $lt: fimDoDia },
      padaria: req.usuario.padaria,
    }).populate("entregador", "nome");

    const entregasConcluidas = [];
    const entregasPendentes = [];

    entregas.forEach((entrega) => {
      const dados = {
        id: entrega._id,
        cliente: entrega.cliente,
        endereco: entrega.endereco,
        produtos: entrega.produtos,
        entregador: entrega.entregador?.nome || "N/A",
        entregue: entrega.entregue,
        pago: entrega.pago,
        horaEntrega: entrega.updatedAt,
      };

      if (entrega.entregue) {
        entregasConcluidas.push(dados);
      } else {
        entregasPendentes.push(dados);
      }
    });

    res.status(200).json({
      entregasConcluidas,
      entregasPendentes,
    });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao buscar entregas do dia",
      detalhes: error.message,
    });
  }
};
// ====== CONTROLLER (controllers/analiticoController.js) ======

exports.obterLocalizacaoEntregadores = async (req, res) => {
  try {
    const entregadores = await Usuario.find({
      role: "entregador",
      padaria: req.usuario.padaria,
      localizacaoAtual: { $ne: null },
    }).select("nome localizacaoAtual");

    res.json(entregadores);
  } catch (erro) {
    res
      .status(500)
      .json({ erro: "Erro ao buscar localização dos entregadores" });
  }
};
exports.analisarPrevisaoEntregas = async (req, res) => {
  try {
    const agora = new Date();
    const inicioDoDia = new Date(agora.setHours(0, 0, 0, 0));
    const fimDoDia = new Date(agora.setHours(23, 59, 59, 999));

    const entregas = await Entrega.find({
      createdAt: { $gte: inicioDoDia, $lt: fimDoDia },
      padaria: req.usuario.padaria,
    }).populate("entregador", "nome");

    const resultado = entregas.map((entrega) => {
      const horaPrevista = entrega.horaPrevista;
      const horaEntrega = entrega.entregue ? entrega.updatedAt : null;

      let status = "Pendente";

      if (entrega.entregue && horaPrevista && horaEntrega) {
        status = horaEntrega > horaPrevista ? "Atrasada" : "No horário";
      }

      return {
        cliente: entrega.cliente,
        endereco: entrega.endereco,
        entregador: entrega.entregador?.nome || "N/A",
        horaPrevista,
        horaEntrega,
        status,
      };
    });

    res.status(200).json(resultado);
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao analisar entregas previstas",
      detalhes: error.message,
    });
  }
};
exports.listarEntregasAtrasadas = async (req, res) => {
  try {
    const agora = new Date();

    const entregas = await Entrega.find({
      padaria: req.usuario.padaria,
      entregue: false,
      horaPrevista: { $ne: null },
    }).select("cliente endereco horaPrevista entregador");

    const entregasNoHorario = [];
    const entregasAtrasadas = [];

    entregas.forEach((entrega) => {
      const dados = {
        cliente: entrega.cliente,
        endereco: entrega.endereco,
        horaPrevista: entrega.horaPrevista,
        entregador: entrega.entregador,
      };

      if (entrega.horaPrevista <= agora) {
        entregasAtrasadas.push(dados);
      } else {
        entregasNoHorario.push(dados);
      }
    });

    res.json({ entregasNoHorario, entregasAtrasadas });
  } catch (erro) {
    console.error("Erro ao buscar entregas atrasadas:", erro);
    res.status(500).json({ erro: "Erro ao buscar entregas atrasadas." });
  }
};
exports.notificacoesRecentes = async (req, res) => {
  try {
    const agora = new Date();
    const inicioDoDia = new Date(agora.setHours(0, 0, 0, 0));
    const fimDoDia = new Date(agora.setHours(23, 59, 59, 999));

    const entregas = await Entrega.find({
      padaria: req.usuario.padaria,
      updatedAt: { $gte: inicioDoDia, $lte: fimDoDia },
    })
      .sort({ updatedAt: -1 })
      .limit(20);

    const eventos = entregas.map((entrega) => {
      let tipo = "Atualização";
      if (entrega.problemas && entrega.problemas.length > 0) tipo = "Problema";
      else if (entrega.entregue) tipo = "Entrega realizada";
      else if (entrega.pagamentos && entrega.pagamentos.length > 0)
        tipo = "Pagamento";

      return {
        id: entrega._id,
        cliente: entrega.cliente,
        tipo,
        horario: entrega.updatedAt,
      };
    });

    res.json({ eventos });
  } catch (erro) {
    res.status(500).json({
      erro: "Erro ao buscar notificações recentes",
      detalhes: erro.message,
    });
  }
};
exports.entregasTempoReal = async (req, res) => {
  try {
    const padariaId = req.query.padaria || req.usuario.padaria;

    if (!padariaId) {
      return res.status(400).json({ erro: "Padaria não especificada." });
    }

    const entregasDeHoje = await Entrega.find({
      padaria: padariaId,
      data: { $gte: new Date().setHours(0, 0, 0, 0) },
    });

    res.json(entregasDeHoje);
  } catch (erro) {
    console.error("Erro ao buscar entregas tempo real:", erro);
    res.status(500).json({ erro: "Erro interno ao buscar entregas." });
  }
};
exports.pagamentosDetalhados = async (req, res) => {
  try {
    const { dataInicial, dataFinal, forma } = req.query;

    const filtros = {
      "pagamentos.0": { $exists: true }, // entregas com pagamentos
      padaria: req.usuario.padaria,
    };

    if (dataInicial && dataFinal) {
      filtros["pagamentos.data"] = {
        $gte: new Date(dataInicial),
        $lte: new Date(dataFinal),
      };
    }

    // Esse filtro age antes de carregar os dados do banco
    if (forma && forma !== "todas") {
      if (forma === "dinheiro") {
        filtros["pagamentos.forma"] = "não informado";
      } else {
        filtros["pagamentos.forma"] = forma;
      }
    }

    const entregas = await Entrega.find(filtros).populate("entregador");

    const pagamentos = [];
    const clientesSet = new Set();
    let totalRecebido = 0;

    entregas.forEach((entrega) => {
      entrega.pagamentos.forEach((pagamento) => {
        const formaDoPagamento =
          pagamento.forma === "não informado" ? "dinheiro" : pagamento.forma;

        // Filtro adicional no frontend, se necessário
        if (forma && forma !== "todas" && formaDoPagamento !== forma) return;

        pagamentos.push({
          cliente: entrega.cliente,
          entregador: entrega.entregador?.nome || "Desconhecido",
          valor: pagamento.valor,
          forma: formaDoPagamento,
          data: pagamento.data,
        });

        totalRecebido += pagamento.valor;
        clientesSet.add(entrega.cliente);
      });
    });

    const resposta = {
      pagamentos,
      totalRecebido,
      totalPendente: 0, // ainda não implementado
      clientesPagantes: clientesSet.size,
    };

    res.status(200).json(resposta);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: "Erro ao buscar pagamentos detalhados" });
  }
};
