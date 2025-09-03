const mongoose = require("mongoose");
const logger = require("../logs/utils/logger");

const uri = process.env.MONGO_URI || "mongodb://localhost:27017/padaria";
// Se não houver MONGO_URI no .env, cai no local padrão

async function conectarBanco() {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info("Conexão com MongoDB estabelecida!");
  } catch (error) {
    logger.error("Erro ao conectar no MongoDB:", error);
    process.exit(1); // encerra app se falhar no banco
  }
}

module.exports = conectarBanco;
