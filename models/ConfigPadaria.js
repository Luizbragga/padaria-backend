const mongoose = require("mongoose");

const ConfigPadariaSchema = new mongoose.Schema(
  {
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      unique: true,
      required: true,
    },
    inicioCicloFaturamento: { type: Date, required: true }, // data em que o gerente “clicou iniciar”
  },
  { timestamps: true }
);

module.exports = mongoose.model("ConfigPadaria", ConfigPadariaSchema);
