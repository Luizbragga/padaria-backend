// models/RotaEntregador.js
const mongoose = require("mongoose");

const RotaEntregadorSchema = new mongoose.Schema(
  {
    // 🔗 quem está executando a rota
    entregadorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario", // <- mantenha consistente com sua collection de usuários
      required: true,
      index: true,
    },

    // 📅 dia da rota (normalizado para 00:00:00 local)
    data: {
      type: Date,
      required: true,
      default: () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      },
    },

    // ⏱️ tempos
    inicioRota: { type: Date }, // quando começou
    fimRota: { type: Date }, // quando terminou
    tempoTotalMinutos: { type: Number, default: 0 },

    // 📦 métricas do dia
    entregasTotais: { type: Number, default: 0 },
    entregasConcluidas: { type: Number, default: 0 },
    pagamentosRecebidos: { type: Number, default: 0 },
    problemasReportados: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// ✅ garante 1 registro por entregador por dia
RotaEntregadorSchema.index({ entregadorId: 1, data: 1 }, { unique: true });

// 🔒 sanity check: se há fim, deve haver início
RotaEntregadorSchema.pre("save", function (next) {
  if (this.fimRota && !this.inicioRota) {
    return next(new Error("fimRota definido sem inicioRota."));
  }
  next();
});

module.exports = mongoose.model("RotaEntregador", RotaEntregadorSchema);
