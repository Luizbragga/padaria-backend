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
      let { latitude, longitude } = req.body;

      if (latitude === undefined || longitude === undefined) {
        return res
          .status(400)
          .json({ erro: "Latitude e longitude são obrigatórios." });
      }

      latitude = Number(latitude);
      longitude = Number(longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res
          .status(400)
          .json({ erro: "Latitude e longitude devem ser numéricos." });
      }

      await Usuario.findByIdAndUpdate(req.usuario.id, {
        localizacaoAtual: { latitude, longitude },
      });

      res.json({ mensagem: "Localização atualizada com sucesso." });
    } catch (error) {
      console.error("Erro ao atualizar localização:", error);
      res
        .status(500)
        .json({
          erro: "Erro ao atualizar localização",
          detalhes: error.message,
        });
    }
  }
);

module.exports = router;
