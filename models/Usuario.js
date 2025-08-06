const mongoose = require("mongoose");
const UsuarioSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    senha: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["entregador", "gerente", "admin"],
      default: "entregador",
    },
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      required: function () {
        return this.role !== "admin";
      },
    },
    localizacaoAtual: {
      type: {
        latitude: Number,
        longitude: Number,
      },
      default: null,
    },
    refreshToken: {
      type: String,
    },
  },
  { timestamps: true }
);
