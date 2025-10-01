// routes/usuarios.js
const express = require("express");
const router = express.Router();
const Joi = require("joi");
const validate = require("../middlewares/validate");
const usuariosController = require("../controllers/usuariosController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// validação do parâmetro :id (ObjectId do MongoDB)
const objectIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

// validação do corpo para criação (campos obrigatórios)
const usuarioSchema = Joi.object({
  nome: Joi.string().min(1).max(120).required(),
  senha: Joi.string().min(6).max(128).required(),
  role: Joi.string().valid("admin", "gerente", "entregador").required(),
  padaria: Joi.string().optional(), // controller decide obrigatoriedade por regra de negócio
});

// validação do corpo para atualização (campos opcionais, mas ao menos 1 campo)
const usuarioUpdateSchema = Joi.object({
  nome: Joi.string().min(1).max(120),
  senha: Joi.string().min(6).max(128),
  role: Joi.string().valid("admin", "gerente", "entregador"),
  padaria: Joi.string(), // manter string (controller lida com regra de negócio)
}).min(1); // exige ao menos um campo no body

// validação do corpo para troca de senha
const senhaUpdateSchema = Joi.object({
  senhaAtual: Joi.string().min(6).max(128).required(),
  novaSenha: Joi.string().min(6).max(128).required(),
});

// validação de query para listagem com filtros e paginação
const usuariosListQuerySchema = Joi.object({
  // filtros (opcionais)
  nome: Joi.string().min(1).max(120),
  role: Joi.string().valid("admin", "gerente", "entregador"),
  padaria: Joi.string(),

  // paginação (opcional)
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),

  // ordenação (opcional; mantemos nomes comuns sem impor mudança de contrato)
  sort: Joi.string().valid("nome", "role", "createdAt", "updatedAt"),
  order: Joi.string().valid("asc", "desc"),
}).unknown(false); // remove campos não esperados

// body de localização: aceitar pares (lat,lng) OU (latitude,longitude)
const locationBodySchema = Joi.alternatives().try(
  Joi.object({
    lat: Joi.number().required(),
    lng: Joi.number().required(),
  }).required(),
  Joi.object({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
  }).required()
);

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
  validate(usuariosListQuerySchema, "query"),
  usuariosController.listarUsuarios
);

router.get("/me", usuariosController.me);

router.get(
  "/:id",
  validate(objectIdParamSchema, "params"),
  usuariosController.obterUsuario
);

router.patch(
  "/:id",
  autorizar("admin"),
  validate(objectIdParamSchema, "params"),
  validate(usuarioUpdateSchema),
  usuariosController.atualizarUsuario
);

router.patch(
  "/:id/senha",
  validate(objectIdParamSchema, "params"),
  validate(senhaUpdateSchema), // body
  usuariosController.alterarSenha
);

router.delete(
  "/:id",
  autorizar("admin"),
  validate(objectIdParamSchema, "params"),
  usuariosController.excluirUsuario
);

router.patch(
  "/:id/localizacao",
  validate(objectIdParamSchema, "params"),
  validate(locationBodySchema), // body
  usuariosController.atualizarLocalizacao
);

router.put(
  "/atualizar-localizacao",
  autorizar("entregador"),
  validate(locationBodySchema), // body
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
