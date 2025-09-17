const mongoose = require("mongoose");
const { Schema } = mongoose;

const VendaSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId },
    produto: { type: String, required: true },
    precoVenda: { type: Number, required: true, min: 0 },
    custoUnitario: { type: Number, required: true, min: 0 },
    dataHora: { type: Date, default: Date.now },
  },
  { _id: true }
);

const BatchSchema = new Schema(
  {
    tipo: { type: String, enum: ["compra", "producao"], required: true },
    produto: { type: String, required: true, trim: true },
    quantidade: { type: Number, required: true, min: 1, default: 1 },
    custoTotal: { type: Number, required: true, min: 0, default: 0 }, // custo total do lote
    precoSugerido: { type: Number, min: 0 }, // preço sugerido por unidade
    vendidos: { type: Number, default: 0, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const SaldoDiarioSchema = new Schema(
  {
    padaria: {
      type: Schema.Types.ObjectId,
      ref: "Padaria",
      required: true,
      index: true,
    },
    data: { type: Date, required: true, index: true }, // normalizado (00:00)
    batches: [BatchSchema],
    vendas: [VendaSchema],
  },
  { timestamps: true }
);

SaldoDiarioSchema.index({ padaria: 1, data: 1 }, { unique: true });

module.exports = mongoose.model("SaldoDiario", SaldoDiarioSchema);
