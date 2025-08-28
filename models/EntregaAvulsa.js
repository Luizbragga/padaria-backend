// models/EntregaAvulsa.js
const mongoose = require("mongoose");

/* ---------- Subschemas ---------- */

const ProdutoAvulsoSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    quantidade: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const PagamentoSchema = new mongoose.Schema(
  {
    valor: { type: Number, required: true, min: 0 },
    forma: { type: String, default: "não informado", trim: true },
    data: { type: Date, default: Date.now },
  },
  { _id: true }
);

/* ---------- Schema principal ---------- */

const EntregaAvulsaSchema = new mongoose.Schema(
  {
    nomeCliente: { type: String, required: true, trim: true },
    telefone: { type: String, trim: true },
    endereco: { type: String, required: true, trim: true },

    // data escolhida para a entrega
    dataEntrega: { type: Date, required: true },

    produtos: {
      type: [ProdutoAvulsoSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "A entrega deve conter ao menos um produto.",
      },
      required: true,
      default: undefined,
    },

    entregue: { type: Boolean, default: false },
    pago: { type: Boolean, default: false },

    pagamentos: {
      type: [PagamentoSchema],
      default: [],
    },

    observacoes: { type: String, trim: true },

    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
    },

    // GPS obrigatório (lat/lng)
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
  },
  { timestamps: true }
);

/* ---------- Índices úteis ---------- */

// consultas por padaria + data programada
EntregaAvulsaSchema.index({ padaria: 1, dataEntrega: 1 });

// listagens recentes no painel
EntregaAvulsaSchema.index({ padaria: 1, createdAt: -1 });

// buscas por status no dia
EntregaAvulsaSchema.index({ padaria: 1, entregue: 1, pago: 1, dataEntrega: 1 });

module.exports = mongoose.model("EntregaAvulsa", EntregaAvulsaSchema);
