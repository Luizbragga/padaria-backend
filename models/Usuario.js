// models/Usuario.js
const mongoose = require("mongoose");

const UsuarioSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
      unique: true, // login por "nome"
    },

    senha: {
      type: String,
      required: true,
      // select: false, // (opcional)
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

    // 🔵 rota atual assumida pelo entregador (usada para colorir o pin no mapa do gerente)
    rotaAtual: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
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
UsuarioSchema.index({ rotaAtual: 1 }); // (opcional, ajuda em consultas por rota)

module.exports = mongoose.model("Usuario", UsuarioSchema);
