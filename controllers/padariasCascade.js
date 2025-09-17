const mongoose = require("mongoose");
const logger = require("../logs/utils/logger");

const Padaria = require("../models/Padaria");
const Cliente = require("../models/Cliente");
const Entrega = require("../models/Entrega");
const EntregaAvulsa = require("../models/EntregaAvulsa");
const Produto = require("../models/Produto");
const ConfigPadaria = require("../models/ConfigPadaria");
const Usuario = require("../models/Usuario");
const RotaDia = require("../models/RotaDia");
const RotaEntregador = require("../models/RotaEntregador");
const RotaOverride = require("../models/RotaOverride");
const SaldoDiario = require("../models/SaldoDiario");
const SolicitacaoAlteracaoCliente = require("../models/SolicitacaoAlteracaoCliente");
const ClienteAjustePontual = require("../models/ClienteAjustePontual");
const RefreshToken = require("../models/RefreshToken");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function _deleteCascadeCore(padariaId, session) {
  // 0) Garantias básicas
  const padaria = await Padaria.findById(padariaId).session(session);
  if (!padaria) {
    const err = new Error("Padaria não encontrada.");
    err.code = "PADARIA_NOT_FOUND";
    throw err;
  }

  // 1) Buscar usuários NÃO-ADMIN ligados à padaria
  const userFilter = {
    padaria: padariaId,
    role: { $in: ["gerente", "entregador", "atendente"] },
  };
  const usuarios = await Usuario.find(userFilter)
    .select("_id role")
    .session(session);
  const usuarioIds = usuarios.map((u) => u._id);

  // 2) Excluir coleções diretamente vinculadas à padaria
  const results = {};

  results.entregas = await Entrega.deleteMany({ padaria: padariaId }).session(
    session
  );
  results.entregasAvulsas = await EntregaAvulsa.deleteMany({
    padaria: padariaId,
  }).session(session);
  results.ajustesPontuais = await ClienteAjustePontual.deleteMany({
    padaria: padariaId,
  }).session(session);
  results.solicitacoes = await SolicitacaoAlteracaoCliente.deleteMany({
    padaria: padariaId,
  }).session(session);
  results.rotasDia = await RotaDia.deleteMany({ padaria: padariaId }).session(
    session
  );
  results.rotasOverride = await RotaOverride.deleteMany({
    padaria: padariaId,
  }).session(session);
  results.saldoDiario = await SaldoDiario.deleteMany({
    padaria: padariaId,
  }).session(session);
  results.produtos = await Produto.deleteMany({ padaria: padariaId }).session(
    session
  );
  results.clientes = await Cliente.deleteMany({ padaria: padariaId }).session(
    session
  );
  results.config = await ConfigPadaria.deleteMany({
    padaria: padariaId,
  }).session(session);

  // 3) Dependências via usuários (tokens e rota do entregador)
  if (usuarioIds.length) {
    results.refreshTokens = await RefreshToken.deleteMany({
      usuario: { $in: usuarioIds },
    }).session(session);
    results.rotasEntregador = await RotaEntregador.deleteMany({
      entregadorId: { $in: usuarioIds },
    }).session(session);
  } else {
    results.refreshTokens = { deletedCount: 0 };
    results.rotasEntregador = { deletedCount: 0 };
  }

  // 4) Excluir usuários não-admin da padaria
  results.usuarios = await Usuario.deleteMany(userFilter).session(session);

  // 5) Por fim, excluir o documento da padaria
  results.padaria = await Padaria.deleteOne({ _id: padariaId }).session(
    session
  );

  return results;
}

async function deletePadariaCascade(padariaId) {
  if (!isValidObjectId(padariaId)) {
    const err = new Error("ID de padaria inválido.");
    err.code = "INVALID_ID";
    throw err;
  }

  let session;
  try {
    session = await mongoose.startSession();

    let results;
    try {
      await session.withTransaction(
        async () => {
          results = await _deleteCascadeCore(padariaId, session);
        },
        { writeConcern: { w: "majority" } }
      );
      return { usedTransaction: true, results };
    } catch (txErr) {
      logger.warn(
        `Transação indisponível, fallback sem transação: ${
          txErr?.message || txErr
        }`
      );
      results = await _deleteCascadeCore(padariaId, null);
      return { usedTransaction: false, results };
    }
  } finally {
    if (session) session.endSession();
  }
}

module.exports = { deletePadariaCascade };
