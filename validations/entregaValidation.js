const Joi = require("joi");

// Schema para criação
const entregaSchemaCriacao = Joi.object({
  cliente: Joi.string().required().messages({
    "any.required": "O cliente é obrigatório",
  }),
  endereco: Joi.string().required().messages({
    "any.required": "O endereço é obrigatório",
  }),

  // ❌ não é mais required — admin pode criar sem entregador ainda
  entregador: Joi.string().optional(),

  produtos: Joi.array()
    .items(
      Joi.object({
        nome: Joi.string().required().messages({
          "any.required": "O nome do produto é obrigatório",
        }),
        quantidade: Joi.number().integer().min(1).required().messages({
          "any.required": "A quantidade é obrigatória",
          "number.min": "A quantidade mínima é 1",
        }),
      })
    )
    .min(1)
    .required()
    .messages({
      "array.min": "Pelo menos 1 produto deve ser informado",
    }),

  // ✅ Localização obrigatória
  location: Joi.object({
    lat: Joi.number().required().messages({
      "any.required": "Latitude é obrigatória",
    }),
    lng: Joi.number().required().messages({
      "any.required": "Longitude é obrigatória",
    }),
  }).required(),

  entregue: Joi.boolean().optional(),
  pago: Joi.boolean().optional(),
  ativa: Joi.boolean().optional(),

  // ✅ Admin pode informar a padaria no body
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
  entregador: Joi.string().optional(),

  produtos: Joi.array()
    .items(
      Joi.object({
        nome: Joi.string().required(),
        quantidade: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .optional(),

  // ✅ agora pode alterar localização também
  location: Joi.object({
    lat: Joi.number().required(),
    lng: Joi.number().required(),
  }).optional(),

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
