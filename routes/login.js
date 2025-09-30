// routes/login.js
const express = require("express");
const router = express.Router();
const Joi = require("joi");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const Usuario = require("../models/Usuario");
const RefreshToken = require("../models/RefreshToken");
const hashToken = require("../utils/hashToken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definido. Verifique o .env");
}

// helpers
const loginSchema = Joi.object({
  nome: Joi.string().required(),
  senha: Joi.string().required(),
});

function gerarAccessToken(usuario) {
  const payload = {
    id: usuario._id,
    role: usuario.role,
  };
  // gerente/entregador: incluir padaria no payload (consistente com o resto do app)
  if (usuario.role === "gerente" || usuario.role === "entregador") {
    payload.padaria = usuario.padaria;
  }
  // 1h para o access token (compatível com ProtectedRoute)
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

async function criarRefreshToken(usuarioId) {
  // gera token aleatório e computa seu hash
  const token = crypto.randomBytes(64).toString("hex");
  const tokenHash = hashToken(token);
  await RefreshToken.create({
    usuario: usuarioId,
    tokenHash,
    criadoEm: new Date(),
    expiraEm: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
  });
  // retorna o token original para o cliente
  return token;
}

/**
 * POST /login
 */
router.post("/", async (req, res) => {
  try {
    // validação
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ erro: error.details[0].message });

    // usuário
    const usuario = await Usuario.findOne({ nome: req.body.nome });
    if (!usuario)
      return res.status(401).json({ erro: "Usuário ou senha inválidos" });

    const senhaOk = await bcrypt.compare(req.body.senha, usuario.senha);
    if (!senhaOk)
      return res.status(401).json({ erro: "Usuário ou senha inválidos" });

    // limpa refresh tokens antigos desse usuário (higienização)
    await RefreshToken.deleteMany({ usuario: usuario._id });

    // gera tokens
    // gera tokens
    const token = gerarAccessToken(usuario);
    const refreshToken = await criarRefreshToken(usuario._id);

    // grava refresh token em cookie httpOnly
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // usa https em produção
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    });

    // responde apenas com o access token e dados do usuário (sem refreshToken)
    return res.json({
      token,
      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        role: usuario.role,
        padaria: usuario.padaria || null,
      },
    });
  } catch (err) {
    console.error("Erro no login:", err);
    return res
      .status(500)
      .json({ erro: "Erro no login", detalhes: err.message });
  }
});

/**
 * POST /token/refresh
 * body: { refreshToken }
 *
 * Observação: NÃO faz rotação aqui para manter compatível com o front atual,
 * que apenas atualiza o access token. Se quiser rotação, me avisa que ajusto o front também.
 */
router.post("/token/refresh", async (req, res) => {
  try {
    // tenta obter o refreshToken do corpo ou do cookie
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ erro: "refreshToken é obrigatório" });
    }

    const tokenHash = hashToken(refreshToken);
    const registro = await RefreshToken.findOne({
      tokenHash,
    }).populate("usuario");

    if (!registro) {
      return res.status(401).json({ erro: "Refresh token inválido" });
    }
    // impede uso de tokens revogados
    if (registro.revogadoEm) {
      return res.status(401).json({ erro: "Refresh token revogado" });
    }

    if (registro.expiraEm && registro.expiraEm.getTime() < Date.now()) {
      // expirada: apaga e bloqueia
      await RefreshToken.deleteOne({ _id: registro._id });
      return res.status(401).json({ erro: "Refresh token expirado" });
    }

    const usuario = registro.usuario;
    if (!usuario) {
      await RefreshToken.deleteOne({ _id: registro._id });
      return res.status(401).json({ erro: "Usuário não encontrado" });
    }

    // gera novo access token (mesmo fluxo do login)
    const token = gerarAccessToken(usuario);

    return res.json({ token });
  } catch (err) {
    console.error("Erro no refresh:", err);
    return res.status(500).json({ erro: "Erro ao renovar token" });
  }
});

/**
 * POST /logout
 * body: { refreshToken }
 * Opcional para invalidar explicitamente o refresh token no cliente.
 */
router.post("/logout", async (req, res) => {
  try {
    // obtém o refreshToken do corpo ou do cookie; se inexistente, simplesmente retorna
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.json({ ok: true });
    }

    const tokenHash = hashToken(refreshToken);
    const registro = await RefreshToken.findOne({ tokenHash });
    if (registro) {
      await registro.revogar("logout");
    }
    // remove o cookie de refresh do cliente
    res.clearCookie("refreshToken");
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro no logout:", err);
    return res.status(500).json({ erro: "Erro ao fazer logout" });
  }
});

module.exports = router;
