// models/Usuario.js
const mongoose = require("mongoose");

const UsuarioSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
      unique: true, // você faz login por "nome", então é bom ser único
    },

    senha: {
      type: String,
      required: true,
      // Dica: se no seu controller você usa select('+senha'),
      // pode trocar para: select: false
      // select: false,
    },

    role: {
      type: String,
      enum: ["admin", "gerente", "entregador"],
      required: true,
      index: true,
    },

    // Admin pode não ter padaria; gerente/entregador normalmente têm.
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      default: null,
      index: true,
    },

    ativo: {
      type: Boolean,
      default: true,
      index: true,
    },

    // usado em mapas/tempo real
    localizacaoAtual: {
      lat: { type: Number },
      lng: { type: Number },
      updatedAt: { type: Date },
    },

    // opcional: auditoria
    ultimoLoginEm: { type: Date },
  },
  { timestamps: true }
);

// Índices úteis
UsuarioSchema.index({ role: 1, padaria: 1 });
UsuarioSchema.index({ nome: 1 });

// Caso queira forçar que gerente/entregador tenham padaria, ative este hook:
// (Comentado para não alterar seu fluxo atual.)
// UsuarioSchema.pre("save", function (next) {
//   if (this.role !== "admin" && !this.padaria) {
//     return next(new Error("Gerente/Entregador devem ter uma padaria vinculada."));
//   }
//   next();
// });

module.exports = mongoose.model("Usuario", UsuarioSchema);
