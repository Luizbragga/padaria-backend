// routes/produtos.js
const express = require("express");
const router = express.Router();
const Joi = require("joi");
const validate = require("../middlewares/validate");

const controller = require("../controllers/produtosController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// === Schemas de validação ===

// Body do POST /produtos
const produtoCreateSchema = Joi.object({
  nome: Joi.string().min(1).max(200).required(),
  preco: Joi.number().positive().required(),
  padaria: Joi.string().hex().length(24).required(),
}).required();

// Query do GET /produtos
const produtosListQuerySchema = Joi.object({
  padaria: Joi.string().hex().length(24).optional(),
  incluirInativos: Joi.number().valid(0, 1).optional(),
}).unknown(false);

// params :id (ObjectId do MongoDB)
const produtoIdParamSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

// body para atualização parcial (ao menos 1 campo)
const produtoUpdateSchema = Joi.object({
  nome: Joi.string().min(1).max(200),
  preco: Joi.number().positive(),
  padaria: Joi.string().hex().length(24),
  ativo: Joi.boolean(),
}).min(1);

// === Rotas ===

// Criar produto (apenas admin)
router.post(
  "/",
  autenticar,
  autorizar("admin"),
  validate(produtoCreateSchema),
  controller.criarProduto
);

// Listar produtos (admin ou gerente)
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  validate(produtosListQuerySchema, "query"),
  controller.listarProdutos
);

// Atualizar produto (apenas admin)
router.patch(
  "/:id",
  autenticar,
  autorizar("admin"),
  validate(produtoIdParamSchema, "params"),
  validate(produtoUpdateSchema),
  controller.atualizarProduto
);

// Remover produto (apenas admin)
router.delete(
  "/:id",
  autenticar,
  autorizar("admin"),
  validate(produtoIdParamSchema, "params"),
  controller.excluirProduto
);

module.exports = router;
