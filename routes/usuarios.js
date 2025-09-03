const express = require("express");
const router = express.Router();

const usuariosController = require("../controllers/usuariosController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const Usuario = require("../models/Usuario");

/**
 * POST /usuarios
 * Criar novo usuário (somente admin)
 */
router.post(
  "/",
  autenticar,
  autorizar("admin"),
  usuariosController.criarUsuario
);

/**
 * PUT /usuarios/atualizar-localizacao
 * Atualiza a localização atual do entregador logado
 */
router.put(
  "/atualizar-localizacao",
  autenticar,
  autorizar("entregador"),
  async (req, res) => {
    try {
      // aceita lat/lng OU latitude/longitude
      let { lat, lng, latitude, longitude } = req.body;
      lat = Number(lat ?? latitude);
      lng = Number(lng ?? longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res
          .status(400)
          .json({ erro: "Latitude e longitude devem ser numéricos." });
      }

      await Usuario.findByIdAndUpdate(req.usuario.id, {
        localizacaoAtual: { lat, lng, updatedAt: new Date() },
      });

      res.json({ mensagem: "Localização atualizada com sucesso." });
    } catch (error) {
      console.error("Erro ao atualizar localização:", error);
      res.status(500).json({
        erro: "Erro ao atualizar localização",
        detalhes: error.message,
      });
    }
  }
);

module.exports = router;
