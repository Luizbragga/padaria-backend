// padaria-backend/validations/analitico.js
const Joi = require("joi");

const objectId = Joi.string().hex().length(24).messages({
  "string.hex": "id inválido",
  "string.length": "id inválido",
  "string.base": "id inválido",
  "any.required": "id inválido",
});

const ym = Joi.string()
  .pattern(/^\d{4}-(0[1-9]|1[0-2])$/)
  .message("mes deve ser YYYY-MM");

// GET /analitico/media-produtos-por-entrega
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

// GET /analitico/entregas-por-dia
// (Contrato atual só aceita padaria opcional via query; bloqueamos extras)
const entregasPorDiaQuerySchema = Joi.object({
  padaria: objectId.optional(),
}).unknown(false);

// GET /analitico/inadimplencia?mes=YYYY-MM&padaria=<id?>
const inadimplenciaQuerySchema = Joi.object({
  mes: ym.optional(),
  padaria: objectId.optional(),
}).unknown(false);

// GET /analitico/pagamentos
// Mantém contrato atual: aceita padaria opcional, dataEspecifica OU (dataInicial+dataFinal), e forma.
const pagamentosDetalhadosQuerySchema = Joi.object({
  padaria: objectId.optional(),
  dataEspecifica: Joi.date().iso().optional(),
  dataInicial: Joi.date().iso().optional(),
  dataFinal: Joi.date()
    .iso()
    .when("dataInicial", {
      is: Joi.exist(),
      then: Joi.date().min(Joi.ref("dataInicial")),
    })
    .optional(),
  // Mantém contrato: "dinheiro" (mapeia p/ "não informado"), "cartao", "mbway", "todas" ou vazio
  forma: Joi.string()
    .valid("dinheiro", "cartao", "mbway", "todas", "")
    .optional(),
}).unknown(false);

module.exports = {
  mediaProdutosQuerySchema,
  entregasPorDiaQuerySchema,
  inadimplenciaQuerySchema,
  pagamentosDetalhadosQuerySchema,
};
