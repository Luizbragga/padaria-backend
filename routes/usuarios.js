const express = require("express");
const router = express.Router();

const usuariosController = require("../controllers/usuariosController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Usuario = require("../models/Usuario"); // <- faltava isso aqui

// Admin cria novo usuário
router.post(
  "/",
  autenticar,
  autorizar("admin"),
  usuariosController.criarUsuario
);

// Entregador envia localização atual
router.put("/atualizar-localizacao", autenticar, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res
        .status(400)
        .json({ erro: "Latitude e longitude são obrigatórios." });
    }

    await Usuario.findByIdAndUpdate(req.usuario.id, {
      localizacaoAtual: { latitude, longitude },
    });

    res.json({ mensagem: "Localização atualizada com sucesso." });
  } catch (error) {
    res
      .status(500)
      .json({ erro: "Erro ao atualizar localização", detalhes: error.message });
  }
});

module.exports = router;
