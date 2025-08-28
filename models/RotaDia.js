// models/RotaDia.js
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
      default: null, // <-- não obrigatório
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

    // campos auxiliares
    claimedAt: { type: Date, default: Date.now },
    encerradaEm: { type: Date },
  },
  { timestamps: true }
);

// 🔒 Garante que uma mesma padaria só tenha 1 rota por dia com mesmo nome
RotaDiaSchema.index({ padaria: 1, data: 1, rota: 1 }, { unique: true });

// 🔄 Middleware: mantém coerência entre entregador e status
RotaDiaSchema.pre("save", function (next) {
  if (this.entregador && this.status === "livre") {
    this.status = "ocupada";
  }
  if (!this.entregador && this.status === "ocupada") {
    this.status = "livre";
  }
  next();
});

// ⏳ (Opcional) descartar automaticamente rotas antigas (7 dias)
RotaDiaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

module.exports = mongoose.model("RotaDia", RotaDiaSchema);
