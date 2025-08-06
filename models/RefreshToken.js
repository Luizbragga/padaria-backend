const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  criadoEm: {
    type: Date,
    default: Date.now,
  },
  expiraEm: {
    type: Date,
    required: true,
  },
});

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
