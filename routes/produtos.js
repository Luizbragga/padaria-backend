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
  padaria: Joi.string().hex().length(24).required(), // controller já espera ObjectId válido
}).required();

// Query do GET /produtos
// admin: exige ?padaria=<id> ; gerente: controller usa padaria do usuário, então query é opcional
const produtosListQuerySchema = Joi.object({
  padaria: Joi.string().hex().length(24).optional(),
  incluirInativos: Joi.number().valid(0, 1).optional(),
}).unknown(false);

// === Rotas ===

// Criar produto (apenas admin)
router.post(
  "/",
  autenticar,
  autorizar("admin"),
  validate(produtoCreateSchema), // valida e sanitiza body
  controller.criarProduto
);

// Listar produtos (admin ou gerente)
router.get(
  "/",
  autenticar,
  autorizar("admin", "gerente"),
  validate(produtosListQuerySchema, "query"), // valida e sanitiza query
  controller.listarProdutos
);

module.exports = router;
