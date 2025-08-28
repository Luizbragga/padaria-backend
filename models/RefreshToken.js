// models/RefreshToken.js
const mongoose = require("mongoose");

const RefreshTokenSchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true, // ajuda nas buscas por usuário
    },
    token: {
      type: String,
      required: true,
      // manter plaintext como está no seu fluxo atual
      // (se quiser evoluir depois para hash, a gente adapta)
    },
    criadoEm: {
      type: Date,
      default: Date.now,
    },
    expiraEm: {
      type: Date,
      required: true,
      // TTL index será configurado abaixo nos índices
    },

    // ----- opcionais (não quebram o fluxo) -----
    revogadoEm: { type: Date, default: null },
    motivoRevogacao: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

/* ------------------ ÍNDICES ------------------ */
// garante unicidade do token
RefreshTokenSchema.index({ token: 1 }, { unique: true });

// consultas por (usuario, expiraEm) ficam rápidas
RefreshTokenSchema.index({ usuario: 1, expiraEm: 1 });

// TTL: documentos são removidos automaticamente quando expiraEm passar
// OBS: o Mongo só executa TTL de ~60 em 60s; é normal um pequeno atraso.
RefreshTokenSchema.index({ expiraEm: 1 }, { expireAfterSeconds: 0 });

/* --------------- MÉTODOS ÚTEIS --------------- */
RefreshTokenSchema.methods.isExpired = function () {
  return !this.expiraEm || this.expiraEm <= new Date();
};

RefreshTokenSchema.methods.revogar = function (motivo = "revogado") {
  this.revogadoEm = new Date();
  this.motivoRevogacao = motivo;
  return this.save();
};

module.exports = mongoose.model("RefreshToken", RefreshTokenSchema);
