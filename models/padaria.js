const mongoose = require("mongoose");

const padariaSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true },
    cidade: { type: String, required: true },
    estado: { type: String, required: true },
    ativa: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Padaria", padariaSchema);
