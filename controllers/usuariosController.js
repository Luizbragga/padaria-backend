// controllers/usuariosController.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Usuario = require("../models/Usuario");
const logger = require("../logs/utils/logger");

/**
 * Helpers
 */
function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  const obj = userDoc.toObject ? userDoc.toObject() : userDoc;
  delete obj.senha;
  return obj;
}

/**
 * POST /usuarios
 * Criar usuário
 * - Admin pode criar admin/gerente/entregador para qualquer padaria (padaria é obrigatória exceto admin global, se existir no seu modelo)
 * - Gerente pode criar apenas ENTREGADOR na própria padaria
 */
exports.criarUsuario = async (req, res) => {
  try {
    const solicitante = req.usuario; // { id, role, padaria }
    const { nome, senha, role, padaria } = req.body;

    if (!nome || !senha || !role) {
      return res
        .status(400)
        .json({ mensagem: "nome, senha e role são obrigatórios." });
    }

    // Regras de criação
    if (solicitante.role === "admin") {
      // admin pode tudo; se o seu modelo exigir padaria para gerente/entregador, valida:
      if (role !== "admin" && (!padaria || !isObjectId(padaria))) {
        return res
          .status(400)
          .json({ mensagem: "Padaria obrigatória para este cargo." });
      }
    } else if (solicitante.role === "gerente") {
      // gerente só cria entregador na própria padaria
      if (role !== "entregador") {
        return res
          .status(403)
          .json({ mensagem: "Gerente só pode criar entregadores." });
      }
      if (!solicitante.padaria) {
        return res
          .status(400)
          .json({ mensagem: "Gerente sem padaria associada." });
      }
    } else {
      return res
        .status(403)
        .json({ mensagem: "Sem permissão para criar usuários." });
    }

    // Verifica se já existe nome igual na mesma padaria (opcional)
    const filtroDup = { nome };
    if (role !== "admin")
      filtroDup.padaria =
        solicitante.role === "admin" ? padaria : solicitante.padaria;
    const duplicado = await Usuario.findOne(filtroDup).lean();
    if (duplicado) {
      return res
        .status(409)
        .json({ mensagem: "Já existe usuário com esse nome nesta padaria." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoUsuario = await Usuario.create({
      nome,
      senha: senhaHash,
      role,
      padaria:
        solicitante.role === "admin" ? padaria || null : solicitante.padaria,
      ativo: true,
    });

    return res.status(201).json(sanitizeUser(novoUsuario));
  } catch (error) {
    logger.error("Erro ao criar usuário:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao criar usuário", erro: error.message });
  }
};

/**
 * GET /usuarios
 * Listar usuários
 * - Admin lista todos ou por ?padaria=...
 * - Gerente lista apenas usuários da própria padaria
 * - Entregador não lista (apenas perfil próprio)
 */
exports.listarUsuarios = async (req, res) => {
  try {
    const solicitante = req.usuario;
    const { padaria: padariaQuery } = req.query;

    if (solicitante.role === "entregador") {
      return res
        .status(403)
        .json({ mensagem: "Sem permissão para listar usuários." });
    }

    let filtro = {};
    if (solicitante.role === "admin") {
      if (padariaQuery) {
        if (!isObjectId(padariaQuery)) {
          return res.status(400).json({ mensagem: "Padaria inválida." });
        }
        filtro.padaria = padariaQuery;
      }
    } else if (solicitante.role === "gerente") {
      if (!solicitante.padaria) {
        return res
          .status(400)
          .json({ mensagem: "Gerente sem padaria associada." });
      }
      filtro.padaria = solicitante.padaria;
    }

    const usuarios = await Usuario.find(filtro)
      .select("-senha")
      .sort({ nome: 1 });
    return res.json(usuarios);
  } catch (error) {
    logger.error("Erro ao listar usuários:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao listar usuários", erro: error.message });
  }
};

/**
 * GET /usuarios/:id
 * Ver um usuário
 * - Admin pode ver qualquer
 * - Gerente pode ver usuários da própria padaria
 * - Entregador pode ver apenas ele mesmo
 */
exports.obterUsuario = async (req, res) => {
  try {
    const solicitante = req.usuario;
    const { id } = req.params;

    if (!isObjectId(id))
      return res.status(400).json({ mensagem: "ID inválido." });

    const user = await Usuario.findById(id).select("-senha");
    if (!user)
      return res.status(404).json({ mensagem: "Usuário não encontrado." });

    if (solicitante.role === "admin") {
      return res.json(user);
    }
    if (solicitante.role === "gerente") {
      if (String(user.padaria) !== String(solicitante.padaria)) {
        return res.status(403).json({ mensagem: "Sem permissão." });
      }
      return res.json(user);
    }
    // entregador
    if (String(user._id) !== String(solicitante.id)) {
      return res.status(403).json({ mensagem: "Sem permissão." });
    }
    return res.json(user);
  } catch (error) {
    logger.error("Erro ao obter usuário:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao obter usuário", erro: error.message });
  }
};

/**
 * PATCH /usuarios/:id
 * Atualizar usuário (nome, ativo, role*, padaria*)
 * - Admin pode alterar tudo
 * - Gerente: pode alterar apenas ENTREGADORES da própria padaria (nome/ativo). Não pode mudar role para admin/gerente, nem mudar padaria.
 * - Entregador: pode alterar apenas o próprio nome
 */
exports.atualizarUsuario = async (req, res) => {
  try {
    const solicitante = req.usuario;
    const { id } = req.params;
    if (!isObjectId(id))
      return res.status(400).json({ mensagem: "ID inválido." });

    const target = await Usuario.findById(id);
    if (!target)
      return res.status(404).json({ mensagem: "Usuário não encontrado." });

    const { nome, ativo, role, padaria } = req.body;
    const updates = {};

    if (solicitante.role === "admin") {
      if (nome) updates.nome = String(nome).trim();
      if (typeof ativo === "boolean") updates.ativo = ativo;
      if (role) updates.role = role; // admin pode
      if (padaria) {
        if (!isObjectId(padaria))
          return res.status(400).json({ mensagem: "Padaria inválida." });
        updates.padaria = padaria;
      }
    } else if (solicitante.role === "gerente") {
      if (String(target.padaria) !== String(solicitante.padaria)) {
        return res.status(403).json({ mensagem: "Sem permissão." });
      }
      if (target.role !== "entregador") {
        return res
          .status(403)
          .json({ mensagem: "Gerente só altera entregadores." });
      }
      if (nome) updates.nome = String(nome).trim();
      if (typeof ativo === "boolean") updates.ativo = ativo;
      // bloqueios
      if (role && role !== "entregador") {
        return res
          .status(403)
          .json({ mensagem: "Gerente não pode alterar cargo." });
      }
      if (padaria && String(padaria) !== String(solicitante.padaria)) {
        return res
          .status(403)
          .json({ mensagem: "Gerente não pode mover padaria." });
      }
    } else {
      // entregador só pode alterar o próprio nome
      if (String(target._id) !== String(solicitante.id)) {
        return res.status(403).json({ mensagem: "Sem permissão." });
      }
      if (nome) updates.nome = String(nome).trim();
      else {
        return res.status(400).json({ mensagem: "Nada a atualizar." });
      }
    }

    const atualizado = await Usuario.findByIdAndUpdate(id, updates, {
      new: true,
    }).select("-senha");
    return res.json(atualizado);
  } catch (error) {
    logger.error("Erro ao atualizar usuário:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao atualizar usuário", erro: error.message });
  }
};

/**
 * PATCH /usuarios/:id/senha
 * Alterar senha
 * - Admin pode trocar de qualquer usuário
 * - Gerente pode trocar de ENTREGADOR da própria padaria OU a própria senha
 * - Entregador pode trocar a própria senha
 */
exports.alterarSenha = async (req, res) => {
  try {
    const solicitante = req.usuario;
    const { id } = req.params;
    const { senha } = req.body;

    if (!isObjectId(id))
      return res.status(400).json({ mensagem: "ID inválido." });
    if (!senha || String(senha).length < 4) {
      return res.status(400).json({ mensagem: "Senha muito curta." });
    }

    const alvo = await Usuario.findById(id);
    if (!alvo)
      return res.status(404).json({ mensagem: "Usuário não encontrado." });

    if (solicitante.role === "admin") {
      // ok
    } else if (solicitante.role === "gerente") {
      const mesmo = String(alvo._id) === String(solicitante.id);
      const mesmoPadaria = String(alvo.padaria) === String(solicitante.padaria);
      if (!(mesmo || (mesmoPadaria && alvo.role === "entregador"))) {
        return res.status(403).json({ mensagem: "Sem permissão." });
      }
    } else {
      // entregador
      if (String(alvo._id) !== String(solicitante.id)) {
        return res.status(403).json({ mensagem: "Sem permissão." });
      }
    }

    const hash = await bcrypt.hash(senha, 10);
    alvo.senha = hash;
    await alvo.save();

    return res.json({ ok: true });
  } catch (error) {
    logger.error("Erro ao alterar senha:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao alterar senha", erro: error.message });
  }
};

/**
 * DELETE /usuarios/:id
 * Excluir usuário
 * - Admin pode excluir qualquer
 * - Gerente pode excluir ENTREGADOR da própria padaria
 * - Entregador não pode excluir
 */
exports.excluirUsuario = async (req, res) => {
  try {
    const solicitante = req.usuario;
    const { id } = req.params;

    if (!isObjectId(id))
      return res.status(400).json({ mensagem: "ID inválido." });

    const alvo = await Usuario.findById(id);
    if (!alvo)
      return res.status(404).json({ mensagem: "Usuário não encontrado." });

    if (solicitante.role === "admin") {
      // ok
    } else if (solicitante.role === "gerente") {
      if (
        alvo.role !== "entregador" ||
        String(alvo.padaria) !== String(solicitante.padaria)
      ) {
        return res.status(403).json({ mensagem: "Sem permissão." });
      }
    } else {
      return res.status(403).json({ mensagem: "Sem permissão." });
    }

    await Usuario.findByIdAndDelete(id);
    return res.json({ ok: true });
  } catch (error) {
    logger.error("Erro ao excluir usuário:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao excluir usuário", erro: error.message });
  }
};

/**
 * PATCH /usuarios/:id/localizacao
 * Atualizar localização do entregador (para o mapa em tempo real)
 * - Entregador só pode atualizar a própria
 * - Gerente/Admin podem atualizar de qualquer (se necessário para correção)
 * body: { lat: Number, lng: Number }
 */
exports.atualizarLocalizacao = async (req, res) => {
  try {
    const solicitante = req.usuario;
    const { id } = req.params;
    const { lat, lng } = req.body;

    if (!isObjectId(id))
      return res.status(400).json({ mensagem: "ID inválido." });
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res
        .status(400)
        .json({ mensagem: "Latitude/Longitude inválidas." });
    }

    if (
      solicitante.role === "entregador" &&
      String(solicitante.id) !== String(id)
    ) {
      return res.status(403).json({ mensagem: "Sem permissão." });
    }

    const atualizado = await Usuario.findByIdAndUpdate(
      id,
      { localizacaoAtual: { lat, lng }, updatedAt: new Date() },
      { new: true }
    ).select("-senha");

    if (!atualizado)
      return res.status(404).json({ mensagem: "Usuário não encontrado." });

    return res.json(atualizado);
  } catch (error) {
    logger.error("Erro ao atualizar localização:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao atualizar localização", erro: error.message });
  }
};

/**
 * GET /me
 * Perfil do usuário logado
 */
exports.me = async (req, res) => {
  try {
    const me = await Usuario.findById(req.usuario.id).select("-senha");
    if (!me)
      return res.status(404).json({ mensagem: "Usuário não encontrado." });
    return res.json(me);
  } catch (error) {
    logger.error("Erro ao obter perfil:", error);
    return res
      .status(500)
      .json({ mensagem: "Erro ao obter perfil", erro: error.message });
  }
};
