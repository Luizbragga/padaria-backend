// models/Entrega.js
const mongoose = require("mongoose");

/* ---------------- Subschemas ---------------- */
const ProdutoEntregaSchema = new mongoose.Schema(
  {
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
    endereco: { type: String, required: true, trim: true },
    horaPrevista: { type: Date, required: false },

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

    ativa: { type: Boolean, default: true },

    produtos: {
      type: [ProdutoEntregaSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "A entrega deve conter ao menos um produto.",
      },
      required: true,
    },

    entregue: { type: Boolean, default: false },

    // carimbo de quando a entrega foi concluída (não muda com pagamentos)
    entregueEm: { type: Date, default: null },

    pago: { type: Boolean, default: false },

    pagamentos: { type: [PagamentoSchema], default: [] },

    problemas: { type: [ProblemaSchema], default: [] },

    // Coordenadas do destino
    location: {
      lat: { type: Number, required: false },
      lng: { type: Number, required: false },
    },
  },
  { timestamps: true }
);

/* ---------------- Hooks ---------------- */
// Preenche entregueEm na primeira vez que marcar como concluída
EntregaSchema.pre("save", function (next) {
  if (
    this.isModified("entregue") &&
    this.entregue === true &&
    !this.entregueEm
  ) {
    this.entregueEm = new Date();
  }
  next();
});

/* ---------------- Índices úteis ---------------- */
EntregaSchema.index({ padaria: 1, createdAt: -1 });
EntregaSchema.index({ padaria: 1, entregue: 1, pago: 1, createdAt: -1 });
EntregaSchema.index({ entregador: 1, entregue: 1, createdAt: -1 });
EntregaSchema.index({ cliente: 1, createdAt: -1 });
EntregaSchema.index({ padaria: 1, entregueEm: -1 }); // para buscas por concluídas recentemente

/* ---------------- Export ---------------- */
module.exports = mongoose.model("Entrega", EntregaSchema);
