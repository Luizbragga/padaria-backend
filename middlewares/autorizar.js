const logger = require("../logs/utils/logger");

module.exports = function (...rolesPermitidas) {
  return (req, res, next) => {
    logger.info("🔍 DEBUG >> ROLE do usuário:", req.usuario?.role);
    logger.info("🔍 DEBUG >> ROLES permitidas:", rolesPermitidas);

    if (!req.usuario || !rolesPermitidas.includes(req.usuario.role)) {
      return res
        .status(403)
        .json({ erro: "Acesso negado: permissão insuficiente." });
    }

    next();
  };
};
