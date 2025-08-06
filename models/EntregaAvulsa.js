const mongoose = require("mongoose");

const entregaAvulsaSchema = new mongoose.Schema(
  {
    nomeCliente: { type: String, required: true },
    telefone: { type: String },
    endereco: { type: String, required: true },
    dataEntrega: { type: Date, required: true },

    produtos: [
      {
        nome: { type: String, required: true },
        quantidade: { type: Number, required: true },
      },
    ],

    entregue: { type: Boolean, default: false },
    pago: { type: Boolean, default: false },

    pagamentos: [
      {
        valor: Number,
        forma: String,
        data: Date,
      },
    ],

    observacoes: { type: String },

    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
    },

    location: {
      lat: Number,
      lng: Number,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EntregaAvulsa", entregaAvulsaSchema);
