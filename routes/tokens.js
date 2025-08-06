const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/RefreshToken");
const Usuario = require("../models/Usuario");

const JWT_SECRET = "padaria_super_secreta_123";

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) return res.status(401).json({ erro: "Token ausente." });

  try {
    // Verifica se o token existe no banco
    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
    if (!tokenDoc) return res.status(403).json({ erro: "Token inválido." });

    // Busca o usuário
    const usuario = await Usuario.findById(tokenDoc.usuario);
    if (!usuario)
      return res.status(404).json({ erro: "Usuário não encontrado." });

    // Verifica se o token expirou
    if (tokenDoc.expiraEm < new Date()) {
      await RefreshToken.deleteOne({ _id: tokenDoc._id }); // limpa o token expirado
      return res.status(403).json({ erro: "Token expirado." });
    }

    // Gera novo access token
    const novoToken = jwt.sign(
      { id: usuario._id, role: usuario.role },
      JWT_SECRET,
      { expiresIn: "60m" }
    );

    res.json({ token: novoToken });
  } catch (err) {
    console.error("Erro ao renovar token:", err);
    res.status(500).json({ erro: "Erro ao renovar token." });
  }
});
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ erro: "Refresh token obrigatório." });
  }

  try {
    const resultado = await RefreshToken.deleteOne({ token: refreshToken });

    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Token não encontrado." });
    }

    res.json({ mensagem: "Logout realizado com sucesso." });
  } catch (err) {
    console.error("Erro no logout:", err);
    res.status(500).json({ erro: "Erro ao realizar logout." });
  }
});

module.exports = router;
