const { createLogger, format, transports } = require("winston");
const path = require("path");

const logger = createLogger({
  level: "info", // níveis: error, warn, info, http, debug
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(({ level, message, timestamp }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new transports.Console(), // mostra no terminal
    new transports.File({
      filename: path.join("logs", "error.log"),
      level: "error",
    }),
    new transports.File({ filename: path.join("logs", "combined.log") }),
  ],
});

module.exports = logger;
