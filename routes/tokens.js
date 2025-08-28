const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const RefreshToken = require("../models/RefreshToken");
const Usuario = require("../models/Usuario");

// --- Config ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definido. Configure no .env");
}
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS || 7);

// util: gera novo refresh token doc
function buildRefreshTokenDoc(usuarioId) {
  const now = Date.now();
  const ttlMs = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
  return {
    usuario: usuarioId,
    token: crypto.randomBytes(64).toString("hex"),
    criadoEm: new Date(now),
    expiraEm: new Date(now + ttlMs),
  };
}

// util: monta payload do access token consistente com o login
function buildAccessPayload(usuario) {
  const payload = {
    id: usuario._id,
    role: usuario.role,
  };
  if (usuario.role === "gerente" || usuario.role === "entregador") {
    // garante padaria no payload (usado por middlewares e filtros)
    payload.padaria = usuario.padaria;
  }
  return payload;
}

/**
 * POST /token/refresh
 * Body: { refreshToken }
 * Retorna: { token, refreshToken }   // faz rotação do refresh token
 */
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ erro: "Refresh token ausente." });
  }

  try {
    // 1) confere se existe
    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
    if (!tokenDoc) {
      return res.status(403).json({ erro: "Refresh token inválido." });
    }

    // 2) confere expiração
    if (tokenDoc.expiraEm < new Date()) {
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(403).json({ erro: "Refresh token expirado." });
    }

    // 3) busca usuário
    const usuario = await Usuario.findById(tokenDoc.usuario);
    if (!usuario) {
      // limpa também o token órfão
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(404).json({ erro: "Usuário não encontrado." });
    }

    // (opcional) bloqueios extras: usuário ativo? role válida?
    if (usuario.ativo === false) {
      await RefreshToken.deleteMany({ usuario: usuario._id });
      return res.status(403).json({ erro: "Usuário desativado." });
    }

    // 4) emite novo access token (60m)
    const payload = buildAccessPayload(usuario);
    const novoAccessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "60m" });

    // 5) rotação do refresh: invalida o antigo e cria um novo
    await RefreshToken.deleteOne({ _id: tokenDoc._id });
    const novoRefreshDoc = buildRefreshTokenDoc(usuario._id);
    await RefreshToken.create(novoRefreshDoc);

    return res.json({
      token: novoAccessToken,
      refreshToken: novoRefreshDoc.token,
    });
  } catch (err) {
    console.error("Erro ao renovar token:", err);
    return res.status(500).json({ erro: "Erro ao renovar token." });
  }
});

/**
 * POST /token/logout
 * Body: { refreshToken }
 * Invalida o refresh token (logout de sessão atual).
 * Se quiser “logout global”, deleteMany por usuario.
 */
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ erro: "Refresh token obrigatório." });
  }

  try {
    const resultado = await RefreshToken.deleteOne({ token: refreshToken });

    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Refresh token não encontrado." });
    }

    return res.json({ mensagem: "Logout realizado com sucesso." });
  } catch (err) {
    console.error("Erro no logout:", err);
    return res.status(500).json({ erro: "Erro ao realizar logout." });
  }
});

module.exports = router;
