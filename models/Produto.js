// models/Produto.js
const mongoose = require("mongoose");

const ProdutoSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    preco: { type: Number, required: true, min: 0 },

    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
      index: true,
    },

    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ---------- Índices úteis ---------- */
// Evita produtos duplicados com o mesmo nome na mesma padaria
ProdutoSchema.index({ padaria: 1, nome: 1 }, { unique: true });

module.exports = mongoose.model("Produto", ProdutoSchema);
