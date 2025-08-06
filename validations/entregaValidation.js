const Joi = require("joi");

// Schema para criação (entregador e padaria são obrigatórios no backend, mas padaria virá opcional no body)
const entregaSchemaCriacao = Joi.object({
  cliente: Joi.string().required(),
  endereco: Joi.string().required(),
  entregador: Joi.string().required(),
  produtos: Joi.array()
    .items(
      Joi.object({
        nome: Joi.string().required(),
        quantidade: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .required(),
  location: Joi.object({
    lat: Joi.number().required(),
    lng: Joi.number().required(),
  }),
  entregue: Joi.boolean().optional(),
  pago: Joi.boolean().optional(),
  ativa: Joi.boolean().optional(),

  // ✅ Adicionado: permite que admin envie a padaria no body (caso necessário)
  padaria: Joi.string().optional(),

  pagamentos: Joi.array()
    .items(
      Joi.object({
        valor: Joi.number().required(),
        forma: Joi.string().required(),
        data: Joi.date().required(),
      })
    )
    .optional(),

  problemas: Joi.array()
    .items(
      Joi.object({
        tipo: Joi.string().required(),
        descricao: Joi.string().required(),
        data: Joi.date().required(),
      })
    )
    .optional(),
});

// Schema para atualização (todos os campos opcionais)
const entregaSchemaAtualizacao = Joi.object({
  cliente: Joi.string().optional(),
  endereco: Joi.string().optional(),
  produtos: Joi.array()
    .items(
      Joi.object({
        nome: Joi.string().required(),
        quantidade: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .optional(),
  entregue: Joi.boolean().optional(),
  pago: Joi.boolean().optional(),
  ativa: Joi.boolean().optional(),

  pagamentos: Joi.array()
    .items(
      Joi.object({
        valor: Joi.number().required(),
        forma: Joi.string().required(),
        data: Joi.date().required(),
      })
    )
    .optional(),

  problemas: Joi.array()
    .items(
      Joi.object({
        tipo: Joi.string().required(),
        descricao: Joi.string().required(),
        data: Joi.date().required(),
      })
    )
    .optional(),
});

module.exports = {
  entregaSchemaCriacao,
  entregaSchemaAtualizacao,
};
