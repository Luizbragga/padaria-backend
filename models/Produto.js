const mongoose = require("mongoose");

const produtoSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true },
    preco: { type: Number, required: true },
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
    },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Produto", produtoSchema);
