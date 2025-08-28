// models/Padaria.js
const mongoose = require("mongoose");

const PadariaSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    cidade: { type: String, required: true, trim: true },
    estado: { type: String, required: true, trim: true },

    ativa: { type: Boolean, default: true },

    // Futuro: campo para GPS da padaria (para relatórios ou entregas saindo do ponto inicial)
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: true }
);

/* ---------- Índices úteis ---------- */
PadariaSchema.index({ nome: 1, cidade: 1 }, { unique: true });

module.exports = mongoose.model("Padaria", PadariaSchema);
