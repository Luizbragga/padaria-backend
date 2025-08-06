const Padaria = require("../models/Padaria");

exports.listarPadarias = async (req, res) => {
  try {
    const padarias = await Padaria.find().sort({ nome: 1 });
    res.status(200).json(padarias);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar padarias" });
  }
};
const Usuario = require("../models/Usuario");

const mongoose = require("mongoose");

exports.listarUsuariosPorPadaria = async (req, res) => {
  try {
    const { id } = req.params;

    // Verifica se o ID é válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ erro: "ID de padaria inválido." });
    }

    const usuarios = await Usuario.find({ padaria: id }).select("-senha");

    res.status(200).json(usuarios);
  } catch (error) {
    logger.error("Erro ao buscar usuários:", error);
    res.status(500).json({ erro: "Erro ao buscar usuários da padaria" });
  }
};
