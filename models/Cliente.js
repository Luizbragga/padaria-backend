const mongoose = require("mongoose");

const clienteSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
    },
    telefone: String,
    endereco: {
      type: String,
      required: true,
    },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
    },
    rota: {
      type: String,
      required: true,
    },
    padraoSemanal: {
      segunda: [
        {
          produto: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
          quantidade: Number,
        },
      ],
      terca: [
        {
          produto: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
          quantidade: Number,
        },
      ],
      quarta: [
        {
          produto: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
          quantidade: Number,
        },
      ],
      quinta: [
        {
          produto: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
          quantidade: Number,
        },
      ],
      sexta: [
        {
          produto: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
          quantidade: Number,
        },
      ],
      sabado: [
        {
          produto: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
          quantidade: Number,
        },
      ],
      domingo: [
        {
          produto: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" },
          quantidade: Number,
        },
      ],
    },

    alteracoesPontuais: [
      {
        data: Date,
        produtos: [{ produto: String, quantidade: Number }],
      },
    ],
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Cliente", clienteSchema);
