// padaria-backend/validations/rotas.js
const Joi = require("joi");

const objectId = Joi.string().hex().length(24).messages({
  "string.hex": "id inválido",
  "string.length": "id inválido",
  "string.base": "id inválido",
  "any.required": "id inválido",
});

const nomesQuerySchema = Joi.object({
  padaria: objectId.optional(), // só será usado por admin
}).unknown(false);

const claimBodySchema = Joi.object({
  rota: Joi.string().trim().max(30).required(), // manter contrato: string livre, upcase feito na rota
}).unknown(false);

const forceReleaseBodySchema = Joi.object({
  rota: Joi.string().trim().max(30).required(),
}).unknown(false);

module.exports = {
  nomesQuerySchema,
  claimBodySchema,
  forceReleaseBodySchema,
};
