// middlewares/errorHandler.js
const logger = require("../logs/utils/logger");

/**
 * Middleware de tratamento de erros.
 * Capture qualquer erro que chegou a este ponto e envie uma resposta padronizada.
 *
 * Para lançar um erro customizado em rotas, use:
 *   const err = new Error("Mensagem");
 *   err.status = 400;
 *   next(err);
 */
module.exports = function errorHandler(err, req, res, next) {
  // Loga o erro com detalhes internos
  logger.error("Unhandled error:", err);

  // Usa status informado ou 500
  const status = err.status || 500;

  // Em produção, não exibe stack traces nem mensagens sensíveis
  let message;
  if (status === 500) {
    message = "Erro interno no servidor.";
  } else {
    message = err.message || "Erro desconhecido.";
  }

  res.status(status).json({ erro: message });
};
