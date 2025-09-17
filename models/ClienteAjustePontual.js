const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  {
    produto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Produto",
      required: true,
    },
    quantidade: { type: Number, required: true, min: 0 },
    // opcional: permite congelar preço no dia do ajuste
    preco: { type: Number },
  },
  { _id: false }
);

const ClienteAjustePontualSchema = new mongoose.Schema(
  {
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
      index: true,
    },
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cliente",
      required: true,
      index: true,
    },
    data: { type: Date, required: true, index: true }, // usar 00:00 local
    tipo: { type: String, enum: ["add", "replace"], default: "add" }, // add = soma ao padrão; replace = substitui o padrão do dia
    itens: [ItemSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  },
  { timestamps: true }
);

ClienteAjustePontualSchema.index({ cliente: 1, data: 1 }, { unique: true });

module.exports = mongoose.model(
  "ClienteAjustePontual",
  ClienteAjustePontualSchema
);
