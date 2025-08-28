// dentro exports.entregasPorEntregador
const match = {};
// se admin/gerente passou ?padaria=... usamos; caso contrário, se for gerente, usamos req.usuario.padaria
const padariaParam = req.query.padaria || req.usuario?.padaria;
if (padariaParam) {
  match.padaria = new mongoose.Types.ObjectId(padariaParam);
}

const resultado = await Entrega.aggregate([
  { $match: match }, // <--- adiciona esta linha
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
