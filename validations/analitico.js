// padaria-backend/validations/analitico.js
const Joi = require("joi");

const objectId = Joi.string().hex().length(24).messages({
  "string.hex": "id inválido",
  "string.length": "id inválido",
  "string.base": "id inválido",
  "any.required": "id inválido",
});

// GET /analitico/media-produtos-por-entrega
// Aceita padaria (opcional p/ admin), dataInicio/dataFim ISO; bloqueia extras.
const mediaProdutosQuerySchema = Joi.object({
  padaria: objectId.optional(),
  dataInicio: Joi.date().iso().optional(),
  dataFim: Joi.date()
    .iso()
    .when("dataInicio", {
      is: Joi.exist(),
      then: Joi.date().min(Joi.ref("dataInicio")),
    })
    .optional(),
}).unknown(false);

module.exports = {
  mediaProdutosQuerySchema,
};
