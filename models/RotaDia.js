const mongoose = require("mongoose");

const RotaDiaSchema = new mongoose.Schema(
  {
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
    },

    // data local normalizada: 'YYYY-MM-DD'
    data: { type: String, required: true },

    rota: { type: String, required: true, trim: true },

    // quem está segurando a rota AGORA (pode ser null quando liberada)
    entregador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      default: null, // <-- antes era required: true
    },

    // batimento para detectar inatividade (para “reassumir” após X min)
    lastSeenAt: { type: Date },

    // histórico de posses da rota ao longo do dia
    historico: [
      {
        entregador: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
        inicio: { type: Date },
        fim: { type: Date },
      },
    ],

    // estado da rota no dia
    status: {
      type: String,
      enum: ["livre", "ocupada", "concluida"],
      default: "livre",
    },

    // seus campos existentes – mantidos
    claimedAt: { type: Date, default: Date.now },
    encerradaEm: { type: Date },
  },
  { timestamps: true }
);

// uma (padaria, data, rota) só pode existir uma vez
RotaDiaSchema.index({ padaria: 1, data: 1, rota: 1 }, { unique: true });

module.exports = mongoose.model("RotaDia", RotaDiaSchema);
