const mongoose = require("mongoose");

const rotaEntregadorSchema = new mongoose.Schema(
  {
    entregadorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    data: {
      type: Date,
      required: true,
      default: () => new Date().setHours(0, 0, 0, 0), // Zera a hora, salva só o dia
    },
    inicioRota: Date,
    fimRota: Date,
    tempoTotalMinutos: Number,
    entregasTotais: Number,
    entregasConcluidas: Number,
    pagamentosRecebidos: Number,
    problemasReportados: Number,
  },
  {
    timestamps: true,
  }
);
mongoose.set('strictQuery', false);
module.exports = mongoose.model("RotaEntregador", rotaEntregadorSchema);
