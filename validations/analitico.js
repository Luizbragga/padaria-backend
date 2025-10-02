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

// ... partes de cima (Joi, objectId, ym, etc.) permanecem

// GET /analitico/pendencias-do-mes?padaria=...&mes=YYYY-MM&gracaDia=8
const pendenciasDoMesQuerySchema = Joi.object({
  padaria: objectId.optional(),
  mes: ym.optional(), // mantém contrato: opcional (default = mês atual dentro do handler)
  gracaDia: Joi.number().integer().min(1).max(31).optional(), // default 8 dentro do handler
}).unknown(false);

// GET /analitico/pendencias-anuais?padaria=...&ano=2025&gracaDia=8
const pendenciasAnuaisQuerySchema = Joi.object({
  padaria: objectId.optional(),
  ano: Joi.number().integer().min(2000).max(2100).optional(), // default = ano atual dentro do handler
  gracaDia: Joi.number().integer().min(1).max(31).optional(), // default 8 dentro do handler
}).unknown(false);

// GET /analitico/a-receber?padaria=<id|opcional>&mes=YYYY-MM&ref=<ISO opcional>
const aReceberMensalQuerySchema = Joi.object({
  padaria: objectId.optional(),
  mes: ym.optional(), // ex.: 2025-09
  ref: Joi.date().iso().optional(), // data de referência (regra do dia 8)
}).unknown(false);

module.exports = {
  mediaProdutosQuerySchema,
  entregasPorDiaQuerySchema,
  inadimplenciaQuerySchema,
  pagamentosDetalhadosQuerySchema,
  aReceberMensalQuerySchema,
  pendenciasDoMesQuerySchema,
  pendenciasAnuaisQuerySchema,
};
