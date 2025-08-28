// middlewares/autenticacao.js
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definido. Verifique o .env");
}

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    // Espera "Bearer <token>"
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({ erro: "Token não fornecido." });
    }

    const token = authHeader.slice(7).trim(); // remove "Bearer "
    if (!token) {
      return res.status(401).json({ erro: "Token não fornecido." });
    }

    // Valida JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ erro: "Token inválido ou expirado." });
    }

    // Busca usuário com projeção mínima
    const usuario = await Usuario.findById(decoded.id)
      .select("_id role padaria ativo nome")
      .lean();

    if (!usuario) {
      return res.status(401).json({ erro: "Usuário não encontrado." });
    }

    // (Opcional) bloqueio por inatividade
    if (usuario.ativo === false) {
      return res.status(403).json({ erro: "Usuário desativado." });
    }

    // Regra: não-admin precisa ter padaria vinculada
    if (usuario.role !== "admin" && !usuario.padaria) {
      return res.status(403).json({ erro: "Usuário sem padaria vinculada." });
    }

    // Anexa dados úteis no request
    req.usuario = {
      id: String(usuario._id),
      role: usuario.role,
      nome: usuario.nome,
      ...(usuario.padaria ? { padaria: String(usuario.padaria) } : {}),
    };

    return next();
  } catch (err) {
    // fallback
    return res.status(401).json({ erro: "Falha na autenticação." });
  }
};
