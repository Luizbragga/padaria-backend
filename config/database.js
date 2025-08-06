const mongoose = require("mongoose");
const logger = require("../logs/utils/logger");

const uri = "mongodb://localhost:27017/padaria"; // nome do banco será "padaria"

const conectarBanco = async () => {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info("Conexão com MongoDB estabelecida!");
  } catch (error) {
    logger.error("Erro ao conectar no MongoDB:", error);
  }
};

module.exports = conectarBanco;
