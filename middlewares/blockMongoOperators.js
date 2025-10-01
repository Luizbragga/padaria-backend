// middlewares/blockMongoOperators.js
/**
 * Bloqueia chaves com operadores Mongo perigosos:
 *  - Qualquer chave que comece com '$'
 *  - Qualquer chave contendo ponto '.'
 * Verifica recursivamente em body, query e params.
 *
 * Retorna 400 quando encontrar algo suspeito, SEM alterar contratos das rotas.
 */
function hasBadKeys(obj, path = []) {
  if (!obj || typeof obj !== "object") return false;

  // Evita iterar sobre Buffers, Dates, etc.
  if (obj instanceof Date || Buffer.isBuffer(obj)) return false;

  // Arrays: checa itens
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (hasBadKeys(obj[i], path.concat(String(i)))) return true;
    }
    return false;
  }

  for (const key of Object.keys(obj)) {
    // bloqueia nomes com $ no início ou com ponto (.)
    if (key.startsWith("$") || key.includes(".")) {
      return true;
    }
    const val = obj[key];
    if (hasBadKeys(val, path.concat(key))) return true;
  }
  return false;
}

module.exports = function blockMongoOperators() {
  return function (req, res, next) {
    try {
      if (
        hasBadKeys(req.body) ||
        hasBadKeys(req.query) ||
        hasBadKeys(req.params)
      ) {
        return res.status(400).json({
          erro: "Entrada inválida.",
          detalhes: "Operadores Mongo não são permitidos em nomes de campos.",
        });
      }
      next();
    } catch (e) {
      // Em caso de erro inesperado aqui, não vazar detalhes
      return res.status(400).json({ erro: "Entrada inválida." });
    }
  };
};
