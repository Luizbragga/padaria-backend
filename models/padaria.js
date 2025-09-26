const mongoose = require("mongoose");

function sanitizeRotas(input) {
  if (!Array.isArray(input)) return [];
  const set = new Set();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const v = raw.trim().toUpperCase();
    if (!v) continue;
    set.add(v);
    if (set.size >= 50) break;
  }
  return Array.from(set);
}

const PadariaSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    cidade: { type: String, required: true, trim: true },

    // 🇵🇹 Freguesia (opcional)
    freguesia: { type: String, trim: true, default: "" },

    ativa: { type: Boolean, default: true },

    rotasDisponiveis: {
      type: [String],
      default: [],
      set: sanitizeRotas,
    },

    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: true }
);

/* Único por nome + cidade (alinha com o que já tínhamos) */
PadariaSchema.index({ nome: 1, cidade: 1 }, { unique: true });

module.exports = mongoose.model("Padaria", PadariaSchema);
