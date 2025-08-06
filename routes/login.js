const express = require("express");
const router = express.Router();
const Usuario = require("../models/Usuario");
const Joi = require("joi");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/RefreshToken");
const crypto = require("crypto");

const JWT_SECRET = "padaria_super_secreta_123";

const loginSchema = Joi.object({
  nome: Joi.string().required(),
  senha: Joi.string().required(),
});

router.post("/", async (req, res) => {
  try {
    // Validação
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ erro: error.details[0].message });

    // Verifica se o usuário existe
    const usuario = await Usuario.findOne({ nome: req.body.nome });
    if (!usuario)
      return res.status(401).json({ erro: "Usuário ou senha inválidos" });

    // Verifica senha
    const senhaCorreta = await bcrypt.compare(req.body.senha, usuario.senha);
    if (!senhaCorreta)
      return res.status(401).json({ erro: "Usuário ou senha inválidos" });

    // Remove tokens antigos do usuário
    await RefreshToken.deleteMany({ usuario: usuario._id });

    // Gera access token
    const payload = {
      id: usuario._id,
      role: usuario.role,
    };

    // Se for gerente ou entregador, adiciona a padaria
    if (usuario.role === "gerente" || usuario.role === "entregador") {
      payload.padaria = usuario.padaria;
    }

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });

    // Gera refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");

    // Salva no banco
    await RefreshToken.create({
      usuario: usuario._id,
      token: refreshToken,
      criadoEm: new Date(),
      expiraEm: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
    });

    // Retorna os dados
    res.json({
      token,
      refreshToken,
      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        role: usuario.role,
        padaria: usuario.padaria || null, // se não tiver padaria, envia null
      },
    });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ erro: "Erro no login", detalhes: err.message });
  }
});

module.exports = router;
