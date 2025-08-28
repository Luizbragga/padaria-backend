const mongoose = require("mongoose");

/* ---------------- Subschemas ---------------- */

const ProdutoEntregaSchema = new mongoose.Schema(
  {
    // Para compatibilidade com dados antigos, permitimos tanto nome direto
    // quanto uma referência opcional ao Produto.
    produto: { type: mongoose.Schema.Types.ObjectId, ref: "Produto" }, // opcional
    nome: { type: String, required: true, trim: true },
    quantidade: { type: Number, required: true, min: 1 },
    precoUnitario: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
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

const ProblemaSchema = new mongoose.Schema(
  {
    tipo: { type: String, required: true, trim: true },
    descricao: { type: String, required: true, trim: true },
    data: { type: Date, default: Date.now },
  },
  { _id: true }
);

/* ---------------- Schema principal ---------------- */

const EntregaSchema = new mongoose.Schema(
  {
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cliente",
      required: true,
    },

    endereco: {
      type: String,
      required: true,
      trim: true,
    },

    horaPrevista: {
      type: Date,
      required: false,
    },

    entregador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: false, // é definido quando o entregador assume a rota
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

    produtos: {
      type: [ProdutoEntregaSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "A entrega deve conter ao menos um produto.",
      },
      required: true,
    },

    entregue: {
      type: Boolean,
      default: false,
    },

    pago: {
      type: Boolean,
      default: false,
    },

    pagamentos: {
      type: [PagamentoSchema],
      default: [],
    },

    problemas: {
      type: [ProblemaSchema],
      default: [],
    },

    // Coordenadas do destino; opcionais aqui para não travar fluxos avulsos.
    location: {
      lat: { type: Number, required: false },
      lng: { type: Number, required: false },
    },
  },
  { timestamps: true }
);

/* ---------------- Índices úteis ---------------- */

// Consultas por data e padaria (dashboards e painéis)
EntregaSchema.index({ padaria: 1, createdAt: -1 });

// Filtro comum: status + padaria no dia
EntregaSchema.index({ padaria: 1, entregue: 1, pago: 1, createdAt: -1 });

// Para listar “minhas entregas” rapidamente
EntregaSchema.index({ entregador: 1, entregue: 1, createdAt: -1 });

// Para buscas por cliente no dia
EntregaSchema.index({ cliente: 1, createdAt: -1 });

/* ---------------- Export ---------------- */

module.exports = mongoose.model("Entrega", EntregaSchema);
