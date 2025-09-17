// padaria-backend/models/RotaOverride.js
const mongoose = require("mongoose");

const RotaOverrideSchema = new mongoose.Schema(
  {
    padaria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padaria",
      index: true,
      required: true,
    },
    data: { type: String, index: true, required: true }, // "YYYY-MM-DD"
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cliente",
      index: true,
      required: true,
    },
    novaRota: { type: String, index: true, required: true }, // ex.: "A" ou "C"
    antigaRota: { type: String, index: true, required: true }, // ex.: "B"
  },
  { timestamps: true }
);

RotaOverrideSchema.index({ padaria: 1, data: 1, cliente: 1 }, { unique: true });

module.exports = mongoose.model("RotaOverride", RotaOverrideSchema);
