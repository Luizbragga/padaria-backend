// padaria-backend/validations/pagamentos.js
const Joi = require("joi");

// Regras utilitárias
const objectId = Joi.string().hex().length(24).messages({
  "string.hex": "id inválido",
  "string.length": "id inválido",
  "string.base": "id inválido",
  "any.required": "id inválido",
});

const isoDate = Joi.date().iso();
const money = Joi.number().positive().precision(2).max(100000); // teto prudente

// Métodos e status aceites (não alteram contratos existentes)
const METODOS = ["dinheiro", "cartao", "mbway"];
const STATUS = ["pendente", "pago", "parcial"];

/* ========== Params ========== */
const paramsIdSchema = Joi.object({
  id: objectId.required(),
}).unknown(false);

/* ========== Criação ========== */
const criarPagamentoBodySchema = Joi.object({
  entregaId: objectId.required(),
  valor: money.required(),
  metodo: Joi.string()
    .valid(...METODOS)
    .required(),
  status: Joi.string()
    .valid(...STATUS)
    .default("pago"),
  data: isoDate.default(() => new Date()),
  observacao: Joi.string().trim().max(200).allow("", null).default(null),
}).unknown(false);

/* ========== Atualização (patch) ========== */
const atualizarPagamentoBodySchema = Joi.object({
  valor: money,
  metodo: Joi.string().valid(...METODOS),
  status: Joi.string().valid(...STATUS),
  data: isoDate.default(() => new Date()),
  observacao: Joi.string().trim().max(200).allow("", null),
})
  .min(1) // exige pelo menos um campo permitido
  .unknown(false);

/* ========== Listagem / filtros ========== */
const listarPagamentosQuerySchema = Joi.object({
  dataInicio: isoDate,
  dataFim: isoDate.when("dataInicio", {
    is: Joi.exist(),
    then: Joi.date().min(Joi.ref("dataInicio")),
  }),
  metodo: Joi.string().valid(...METODOS),
  status: Joi.string().valid(...STATUS),
  minValor: money,
  maxValor: money.when("minValor", {
    is: Joi.exist(),
    then: Joi.number().min(Joi.ref("minValor")),
  }),
  pagina: Joi.number().integer().min(1).default(1),
  limite: Joi.number().integer().min(1).max(100).default(20),
  ordenarPor: Joi.string()
    .valid("data", "valor", "metodo", "status")
    .default("data"),
  ordenarDir: Joi.string().valid("asc", "desc").default("desc"),
}).unknown(false);

// ======== Schemas específicos da rota: POST /pagamentos/cliente/:clienteId ========
const registrarPagamentoClienteParamsSchema = Joi.object({
  clienteId: objectId.required(),
}).unknown(false);

const registrarPagamentoClienteBodySchema = Joi.object({
  valor: money.required(),
  forma: Joi.string().trim().max(30).default("não informado"),
  data: isoDate.optional(),
  mes: Joi.string()
    .pattern(/^[0-9]{4}-[0-9]{2}$/)
    .optional(), // YYYY-MM
}).unknown(false);

// ======== Exports ========
module.exports = {
  paramsIdSchema,
  criarPagamentoBodySchema,
  atualizarPagamentoBodySchema,
  listarPagamentosQuerySchema,
  registrarPagamentoClienteParamsSchema,
  registrarPagamentoClienteBodySchema,
  METODOS,
  STATUS,
};
