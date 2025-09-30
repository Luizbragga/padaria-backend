const RotaOverride = require("../models/RotaOverride");

async function buildOverrideMap(padaria, dataISO) {
  const ov = await RotaOverride.findOne({ padaria, dataISO }).lean();
  const map = new Map();
  if (ov?.assignments?.length) {
    for (const a of ov.assignments) {
      map.set(String(a.clienteId), a.toRoute); // 'A' ou 'C'
    }
  }
  return { map, from: ov?.from || null };
}

module.exports = { buildOverrideMap };
