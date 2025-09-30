// padaria-backend/middlewares/validate.js
const Joi = require("joi");

/**
 * Remove qualquer chave que comece com $ ou contenha . (protege contra NoSQL injection).
 * @param {object} obj
 */
function sanitize(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
    } else {
      sanitize(obj[key]);
    }
  }
}

/**
 * Retorna um middleware que valida req[property] contra um schema Joi e sanitiza o payload.
 * @param {Joi.Schema} schema
 * @param {"body"|"query"|"params"} [property="body"]
 */
function validate(schema, property = "body") {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true, // remove campos não definidos no schema
    });
    if (error) {
      // envia a primeira mensagem de erro
      return res.status(400).json({ erro: error.details[0].message });
    }
    // substitui o valor validado e sanitizado
    req[property] = value;
    // aplica sanitização contra NoSQL injection
    sanitize(req[property]);
    next();
  };
}

module.exports = validate;
