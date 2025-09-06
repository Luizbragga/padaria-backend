// models/Cliente.js
const mongoose = require("mongoose");

const PadraoSemanalSchema = new mongoose.Schema(
  {
    produto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Produto",
      required: true,
    },
    quantidade: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const ClienteSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
    },

    endereco: {
      type: String,
      required: true,
      trim: true,
    },

    // rota do cliente (A, B, C...)
    rota: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
      default: "",
    },

    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },

    telefone: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
      index: true,
    },

    ativo: {
      type: Boolean,
      default: true,
    },

    // observações / ponto de referência
    observacoes: {
      type: String,
      trim: true,
      default: "",
    },

    // padrão semanal (listas por dia)
    padraoSemanal: {
      domingo: [PadraoSemanalSchema],
      segunda: [PadraoSemanalSchema],
      terca: [PadraoSemanalSchema],
      quarta: [PadraoSemanalSchema],
      quinta: [PadraoSemanalSchema],
      sexta: [PadraoSemanalSchema],
      sabado: [PadraoSemanalSchema],
    },

    // início do ciclo de faturamento (no nível raiz)
    inicioCicloFaturamento: {
      type: Date,
      default: function () {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        return d;
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cliente", ClienteSchema);
