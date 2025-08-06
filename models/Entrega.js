const mongoose = require("mongoose");

const entregaSchema = new mongoose.Schema(
  {
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cliente",
      required: true,
    },

    endereco: {
      type: String,
      required: true,
    },

    horaPrevista: {
      type: Date,
      required: false,
    },

    entregador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: false,
    },

    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
    },

    ativa: {
      type: Boolean,
      default: true,
    },

    produtos: [
      {
        nome: { type: String, required: true },
        quantidade: { type: Number, required: true },
        precoUnitario: { type: Number, required: true }, // ← novo
        subtotal: { type: Number, required: true }, // ← novo
      },
    ],

    entregue: {
      type: Boolean,
      default: false,
    },

    pago: {
      type: Boolean,
      default: false,
    },

    pagamentos: [
      {
        valor: { type: Number },
        forma: { type: String },
        data: { type: Date },
      },
    ],

    problemas: [
      {
        tipo: { type: String },
        descricao: { type: String },
        data: { type: Date },
      },
    ],

    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Entrega", entregaSchema);
