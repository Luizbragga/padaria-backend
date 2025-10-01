// routes/usuarios.js
const express = require("express");
const router = express.Router();
const Joi = require("joi");
const validate = require("../middlewares/validate");
const usuariosController = require("../controllers/usuariosController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

const usuarioSchema = Joi.object({
  nome: Joi.string().required(),
  senha: Joi.string().required(),
  role: Joi.string().valid("admin", "gerente", "entregador").required(),
  padaria: Joi.string().optional(), // somente exigida conforme a lógica do controller
});

// Todas exigem autenticação
router.use(autenticar);

/**
 * Criar usuário
 * - Somente ADMIN (o controller também valida papéis)
 */
router.post(
  "/",
  autorizar("admin"),
  validate(usuarioSchema),
  usuariosController.criarUsuario
);

/**
 * Listar usuários
 * - Admin e Gerente (o controller filtra o escopo)
 */
router.get(
  "/",
  autorizar("admin", "gerente"),
  usuariosController.listarUsuarios
);

router.get("/me", usuariosController.me);

router.get("/:id", usuariosController.obterUsuario);

router.patch("/:id", usuariosController.atualizarUsuario);

router.patch("/:id/senha", usuariosController.alterarSenha);

router.delete("/:id", usuariosController.excluirUsuario);

router.patch("/:id/localizacao", usuariosController.atualizarLocalizacao);

router.put(
  "/atualizar-localizacao",
  autorizar("entregador"),
  async (req, res) => {
    const Usuario = require("../models/Usuario");
    try {
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
