// middlewares/autorizar.js
const logger = require("../logs/utils/logger");

module.exports = function autorizar(...rolesPermitidas) {
  // suporta autorizar(['gerente','entregador']) ou autorizar('gerente','entregador')
  const allowed = rolesPermitidas.flat().filter(Boolean).map(String);

  return (req, res, next) => {
    const role = req.usuario?.role;

    if (process.env.NODE_ENV !== "production") {
      logger.info("🔍 DEBUG >> ROLE do usuário:", role);
      logger.info("🔍 DEBUG >> ROLES permitidas:", allowed);
    }

    if (!role) {
      return res.status(401).json({ erro: "Não autenticado." });
    }

    // Admin passa em qualquer rota protegida por autorizar
    if (role === "admin") return next();

    // Se nenhuma role foi especificada, apenas exige autenticação
    if (allowed.length === 0) return next();

    if (!allowed.includes(role)) {
      return res
        .status(403)
        .json({ erro: "Acesso negado: permissão insuficiente." });
    }

    next();
  };
};
