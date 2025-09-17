const mongoose = require("mongoose");

const SolicitacaoAlteracaoClienteSchema = new mongoose.Schema(
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
    solicitante: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
    },
    status: {
      type: String,
      enum: ["pendente", "aprovada", "rejeitada"],
      default: "pendente",
      index: true,
    },
    // Campos que o gerente pediu para mudar:
    dados: {
      endereco: String,
      rota: String,
      telefone: String,
      email: String,
      observacoes: String,
    },
    respostaAdm: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "SolicitacaoAlteracaoCliente",
  SolicitacaoAlteracaoClienteSchema
);
