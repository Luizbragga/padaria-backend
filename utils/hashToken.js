// utils/hashToken.js
const crypto = require("crypto");

/**
 * Gera um hash SHA-256 para um token e retorna em hexadecimal.
 * Usado para não guardar refresh tokens em texto puro no banco.
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = hashToken;
