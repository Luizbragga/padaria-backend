// controllers/padariasController.js
const mongoose = require("mongoose");
const Padaria = require("../models/Padaria");
const Usuario = require("../models/Usuario");
const logger = require("../logs/utils/logger");

// GET /padarias?ativas=1
exports.listarPadarias = async (req, res) => {
  try {
    // filtro opcional: ?ativas=1
    const apenasAtivas = String(req.query.ativas || "").trim() === "1";
    const filtro = apenasAtivas ? { ativa: true } : {};

    const padarias = await Padaria.find(filtro).sort({ nome: 1 }).lean();

    return res.status(200).json(padarias);
  } catch (error) {
    logger.error("Erro ao buscar padarias:", error);
    return res.status(500).json({ erro: "Erro ao buscar padarias" });
  }
};

// GET /padarias/:id/usuarios
exports.listarUsuariosPorPadaria = async (req, res) => {
  try {
    const { id } = req.params;

    // valida ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ erro: "ID de padaria inválido." });
    }

    // checagem defensiva simples de papel (a autorização fina pode estar no middleware autorizar)
    const role = req?.usuario?.role;
    if (!role || (role !== "admin" && role !== "gerente")) {
      return res.status(403).json({ erro: "Acesso negado." });
    }

    // se for gerente, opcionalmente garantir que é gerente da própria padaria
    // (descomente se quiser forçar isso aqui; caso já faça no middleware, mantenha comentado)
    // if (role === "gerente" && String(req.usuario.padaria) !== String(id)) {
    //   return res.status(403).json({ erro: "Gerente só pode ver sua própria padaria." });
    // }

    const usuarios = await Usuario.find({ padaria: id })
      .select("-senha -refreshToken") // não vaze dados sensíveis
      .sort({ nome: 1 })
      .lean();

    return res.status(200).json(usuarios);
  } catch (error) {
    logger.error("Erro ao buscar usuários da padaria:", error);
    return res.status(500).json({ erro: "Erro ao buscar usuários da padaria" });
  }
};
