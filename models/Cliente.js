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
    location: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
    },
    telefone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
    padraoSemanal: {
      domingo: [PadraoSemanalSchema],
      segunda: [PadraoSemanalSchema],
      terca: [PadraoSemanalSchema],
      quarta: [PadraoSemanalSchema],
      quinta: [PadraoSemanalSchema],
      sexta: [PadraoSemanalSchema],
      sabado: [PadraoSemanalSchema],

      inicioCicloFaturamento: {
        type: Date,
        // por padrão: amanhã 00:00
        default: function () {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(0, 0, 0, 0);
          return d;
        },
      },
    },
  },

  { timestamps: true }
);

module.exports = mongoose.model("Cliente", ClienteSchema);
