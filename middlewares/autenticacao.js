const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definido. Verifique o .env");
}

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token não fornecido." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const usuario = await Usuario.findById(decoded.id);
    if (!usuario) {
      return res.status(401).json({ erro: "Usuário não encontrado." });
    }
    req.usuario = {
      id: usuario._id.toString(),
      role: usuario.role,
    };

    // Apenas se o usuário tiver padaria vinculada, adiciona
    if (usuario.role !== "admin" && !usuario.padaria) {
      return res.status(403).json({ erro: "Usuário sem padaria vinculada." });
    }

    if (usuario.padaria) {
      req.usuario.padaria = usuario.padaria.toString();
    }

    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
};
