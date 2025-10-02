// padaria-backend/validations/rotasSplit.js
const Joi = require("joi");

const objectId = Joi.string().hex().length(24).messages({
  "string.hex": "id inválido",
  "string.length": "id inválido",
  "string.base": "id inválido",
  "any.required": "id inválido",
});

/**
 * POST /rotas-split/simular
 * body: { rotaAlvo, paraA, paraC, capA?, capC? }
 */
const simularBodySchema = Joi.object({
  rotaAlvo: Joi.string().trim().max(30).required(),
  paraA: Joi.string().trim().max(30).required(),
  paraC: Joi.string().trim().max(30).required(),
  capA: Joi.alternatives()
    .try(Joi.number().integer().min(0), Joi.string().regex(/^\d+$/))
    .optional(),
  capC: Joi.alternatives()
    .try(Joi.number().integer().min(0), Joi.string().regex(/^\d+$/))
    .optional(),
}).unknown(false);

/**
 * POST /rotas-split/aplicar
 * body: { rotaAlvo, paraA, paraC, capA?, capC? }
 */
const aplicarBodySchema = Joi.object({
  rotaAlvo: Joi.string().trim().max(30).required(),
  paraA: Joi.string().trim().max(30).required(),
  paraC: Joi.string().trim().max(30).required(),
  capA: Joi.alternatives()
    .try(Joi.number().integer().min(0), Joi.string().regex(/^\d+$/))
    .optional(),
  capC: Joi.alternatives()
    .try(Joi.number().integer().min(0), Joi.string().regex(/^\d+$/))
    .optional(),
}).unknown(false);

/**
 * DELETE /rotas-split/limpar?rota=B
 * Preferimos `rota` na query; bloqueia extras.
 */
const limparQuerySchema = Joi.object({
  rota: Joi.string().trim().max(30).required(),
  padaria: objectId.optional(),
}).unknown(false);

/**
 * GET /rotas-split/status
 * Apenas padaria opcional (admin via query); bloqueia extras.
 */
const statusQuerySchema = Joi.object({
  padaria: objectId.optional(),
}).unknown(false);

module.exports = {
  simularBodySchema,
  aplicarBodySchema,
  limparQuerySchema,
  statusQuerySchema,
};
