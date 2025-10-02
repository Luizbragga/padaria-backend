// padaria-backend/validations/rotaEntregador.js
const Joi = require("joi");

// GET /rota-entregador não usa query → bloquear extras
const rotaEntregadorGetQuerySchema = Joi.object({}).unknown(false);

// PATCH /rota-entregador/concluir não usa body → bloquear extras
const rotaEntregadorConcluirBodySchema = Joi.object({}).unknown(false);

module.exports = {
  rotaEntregadorGetQuerySchema,
  rotaEntregadorConcluirBodySchema,
};
