// padaria-backend/middlewares/sanitizeRequest.js
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

module.exports = function sanitizeRequest(req, _res, next) {
  try {
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
  } catch (_e) {
    // Em caso de algo inesperado, seguimos sem bloquear a request.
  }
  next();
};
