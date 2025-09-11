// controllers/clientesController.js
const mongoose = require("mongoose");
const Cliente = require("../models/Cliente");
const Padaria = require("../models/Padaria");

/* ---------------- utils ---------------- */
const toObjectIdIfValid = (v) =>
  mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : v;

function assertAdmin(req) {
  const role = req?.usuario?.role;
  if (role !== "admin") {
    const err = new Error("Apenas administradores podem realizar esta ação.");
    err.status = 403;
    throw err;
  }
}

function parseLocation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function ensureHasValidLocation(location) {
  if (!location) {
    const err = new Error(
      "Latitude/Longitude são obrigatórias (location { lat, lng })."
    );
    err.status = 400;
    throw err;
  }
}

/* ---------------- controllers ---------------- */

/** POST /clientes  (ADMIN ONLY) */
exports.criarCliente = async (req, res) => {
  try {
    assertAdmin(req);

    const {
      nome,
      endereco,
      rota,
      padaria,
      location,
      padraoSemanal, // opcional
      inicioCicloFaturamento, // opcional
      telefone, // opcional
      email, // opcional
      observacoes, // opcional
    } = req.body;

    if (!nome || !endereco || !rota || !padaria) {
      return res
        .status(400)
        .json({ erro: "Campos obrigatórios: nome, endereco, rota, padaria." });
    }

    const padariaId = toObjectIdIfValid(padaria);
    const existePadaria = await Padaria.findById(padariaId);
    if (!existePadaria) {
      return res.status(400).json({ erro: "Padaria não encontrada." });
    }

    // location obrigatório
    const loc = parseLocation(location);
    ensureHasValidLocation(loc);

    const rotaNorm = String(rota).trim().toUpperCase();

    // Evita duplicidade por nome dentro da mesma padaria
    const jaExiste = await Cliente.findOne({
      padaria: padariaId,
      nome: new RegExp(`^${nome.trim()}$`, "i"),
    });
    if (jaExiste) {
      return res
        .status(409)
        .json({ erro: "Já existe um cliente com esse nome nesta padaria." });
    }

    // calcula a data de início do ciclo (fallback: amanhã às 00:00)
    const startCycle = inicioCicloFaturamento
      ? new Date(inicioCicloFaturamento)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(0, 0, 0, 0);
          return d;
        })();

    if (isNaN(startCycle.getTime())) {
      return res.status(400).json({ erro: "inicioCicloFaturamento inválido." });
    }

    const novo = await Cliente.create({
      nome: nome.trim(),
      endereco: endereco.trim(),
      rota: rotaNorm,
      padaria: padariaId,
      location: loc,
      inicioCicloFaturamento: startCycle,
      ...(padraoSemanal ? { padraoSemanal } : {}),
      ...(telefone ? { telefone: String(telefone).trim() } : {}),
      ...(email ? { email: String(email).trim().toLowerCase() } : {}),
      ...(observacoes ? { observacoes: String(observacoes).trim() } : {}),
    });

    res.status(201).json(novo);
  } catch (erro) {
    console.error("Erro ao criar cliente:", erro);
    res
      .status(erro.status || 500)
      .json({ erro: erro.message || "Erro ao criar cliente." });
  }
};

/**
 * GET /clientes
 * Params aceitos:
 *  - admin: ?padaria=<id> (obrigatório)
 *  - gerente/atendente: padaria = do usuário (ignora ?padaria)
 *  - rota=A
 *  - busca= (aplica em nome OU endereco)
 *  - buscaNome= (apenas nome)
 *  - buscaEndereco= (apenas endereco)
 *  - pagina=1, limit=50
 */
exports.listarClientes = async (req, res) => {
  try {
    const { role, padaria: padariaUser } = req.usuario || {};
    const {
      padaria: padariaQuery,
      rota,
      busca,
      buscaNome,
      buscaEndereco,
      pagina = 1,
      limit = 50,
    } = req.query;

    // --- padaria ---
    let padariaFiltro = null;
    if (role === "admin") {
      if (!padariaQuery) {
        return res
          .status(400)
          .json({ erro: "Para admin, informe ?padaria=<id>." });
      }
      padariaFiltro = toObjectIdIfValid(padariaQuery);
    } else if (role === "gerente" || role === "atendente") {
      if (!padariaUser)
        return res.status(400).json({ erro: "Usuário sem padaria." });
      padariaFiltro = toObjectIdIfValid(padariaUser);
    } else {
      return res
        .status(403)
        .json({ erro: "Apenas administradores, gerentes ou atendentes." });
    }

    // --- filtros textuais ---
    const and = [{ padaria: padariaFiltro }];

    if (rota) {
      and.push({ rota: String(rota).trim().toUpperCase() });
    }

    if (busca) {
      const rx = new RegExp(String(busca).trim(), "i");
      and.push({ $or: [{ nome: rx }, { endereco: rx }] });
    }

    if (buscaNome) {
      const rx = new RegExp(String(buscaNome).trim(), "i");
      and.push({ nome: rx });
    }

    if (buscaEndereco) {
      const rx = new RegExp(String(buscaEndereco).trim(), "i");
      and.push({ endereco: rx });
    }

    const filtro = and.length > 1 ? { $and: and } : and[0];

    // paginação
    const p = Math.max(1, parseInt(pagina, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (p - 1) * l;

    const clientes = await Cliente.find(filtro, {
      nome: 1,
      endereco: 1,
      rota: 1,
      telefone: 1,
      email: 1,
    })
      .sort({ nome: 1 })
      .skip(skip)
      .limit(l)
      .lean();

    res.json(clientes);
  } catch (erro) {
    console.error("Erro ao listar clientes:", erro);
    res.status(500).json({ erro: "Erro ao listar clientes." });
  }
};

/** PATCH /clientes/:id  (ADMIN ou GERENTE) */
exports.atualizarCliente = async (req, res) => {
  try {
    const { role, padaria: padariaUser } = req?.usuario || {};
    if (!["admin", "gerente"].includes(role)) {
      return res.status(403).json({ erro: "Acesso negado." });
    }

    const { id } = req.params;
    const { nome, endereco, rota, padaria, location } = req.body;

    const cliente = await Cliente.findById(id);
    if (!cliente) {
      return res.status(404).json({ erro: "Cliente não encontrado." });
    }

    // GERENTE só pode mexer em cliente da própria padaria
    if (role === "gerente") {
      if (!padariaUser)
        return res.status(400).json({ erro: "Usuário sem padaria." });
      if (String(cliente.padaria) !== String(padariaUser)) {
        return res.status(403).json({
          erro: "Gerente só pode editar clientes da própria padaria.",
        });
      }
      // gerente não pode trocar a padaria do cliente
      if (
        typeof padaria !== "undefined" &&
        String(padaria) !== String(cliente.padaria)
      ) {
        return res
          .status(403)
          .json({ erro: "Gerente não pode alterar a padaria do cliente." });
      }
    }

    // Admin pode trocar a padaria, mas seguimos exigindo que exista
    if (role === "admin" && typeof padaria !== "undefined") {
      const padariaId = toObjectIdIfValid(padaria);
      const existePadaria = await Padaria.findById(padariaId);
      if (!existePadaria) {
        return res.status(400).json({ erro: "Padaria não encontrada." });
      }
      cliente.padaria = padariaId;
    }

    if (typeof nome === "string") cliente.nome = nome.trim();
    if (typeof endereco === "string") cliente.endereco = endereco.trim();
    if (typeof rota === "string") cliente.rota = rota.trim().toUpperCase();
    if (typeof req.body.telefone === "string")
      cliente.telefone = req.body.telefone.trim();
    if (typeof req.body.email === "string")
      cliente.email = req.body.email.trim().toLowerCase();
    if (typeof req.body.observacoes === "string")
      cliente.observacoes = req.body.observacoes.trim();

    // location é OBRIGATÓRIO no resultado final:
    if (typeof location !== "undefined") {
      const loc = parseLocation(location);
      ensureHasValidLocation(loc);
      cliente.location = loc;
    } else {
      const loc = parseLocation(cliente.location);
      ensureHasValidLocation(loc);
    }

    // Admin pode alterar o início do ciclo de faturamento, se for necessário.
    if (
      role === "admin" &&
      typeof req.body.inicioCicloFaturamento !== "undefined"
    ) {
      const d = new Date(req.body.inicioCicloFaturamento);
      if (isNaN(d.getTime())) {
        return res
          .status(400)
          .json({ erro: "inicioCicloFaturamento inválido." });
      }
      d.setHours(0, 0, 0, 0);
      cliente.inicioCicloFaturamento = d;
    }

    // (opcional) trocar o padrão semanal aqui também
    if (typeof req.body.padraoSemanal !== "undefined") {
      cliente.padraoSemanal = req.body.padraoSemanal || {};
    }

    const atualizado = await cliente.save();
    res.json(atualizado);
  } catch (erro) {
    console.error("Erro ao atualizar cliente:", erro);
    res
      .status(erro.status || 500)
      .json({ erro: erro.message || "Erro ao atualizar cliente." });
  }
};

/** DELETE /clientes/:id  (ADMIN ONLY) */
exports.deletarCliente = async (req, res) => {
  try {
    assertAdmin(req);

    const { id } = req.params;
    const cliente = await Cliente.findById(id);
    if (!cliente) {
      return res.status(404).json({ erro: "Cliente não encontrado." });
    }

    await Cliente.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (erro) {
    console.error("Erro ao deletar cliente:", erro);
    res
      .status(erro.status || 500)
      .json({ erro: erro.message || "Erro ao deletar cliente." });
  }
};

/* --------- Padrão semanal (para previsões) ---------- */
const popPaths = [
  "padraoSemanal.domingo.produto",
  "padraoSemanal.segunda.produto",
  "padraoSemanal.terca.produto",
  "padraoSemanal.quarta.produto",
  "padraoSemanal.quinta.produto",
  "padraoSemanal.sexta.produto",
  "padraoSemanal.sabado.produto",
].map((p) => ({ path: p, select: "nome preco" }));

function normDia(lista = []) {
  return lista.map((i) => {
    const p = i.produto;
    const preco = p && typeof p === "object" ? Number(p.preco) || 0 : 0;
    const id = p && typeof p === "object" ? String(p._id) : String(p);
    return {
      produtoId: id,
      produto: p?.nome ?? id,
      preco,
      quantidade: Number(i.quantidade) || 0,
      subtotal: (Number(i.quantidade) || 0) * preco,
    };
  });
}

/** GET /clientes/:id/padrao-semanal */
exports.padraoSemanalCliente = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ erro: "ID inválido." });
    }

    const cli = await Cliente.findById(id).populate(popPaths).lean();
    if (!cli) return res.status(404).json({ erro: "Cliente não encontrado." });

    // (opcional) bloquear gerente de ver cliente de outra padaria:
    if (
      req.usuario?.role === "gerente" &&
      String(cli.padaria) !== String(req.usuario.padaria)
    ) {
      return res.status(403).json({
        erro: "Gerente só pode consultar clientes da própria padaria.",
      });
    }

    const out = {
      clienteId: String(cli._id),
      nome: cli.nome,
      inicioCicloFaturamento: cli.inicioCicloFaturamento,
      padraoSemanal: {
        domingo: normDia(cli.padraoSemanal?.domingo),
        segunda: normDia(cli.padraoSemanal?.segunda),
        terca: normDia(cli.padraoSemanal?.terca),
        quarta: normDia(cli.padraoSemanal?.quarta),
        quinta: normDia(cli.padraoSemanal?.quinta),
        sexta: normDia(cli.padraoSemanal?.sexta),
        sabado: normDia(cli.padraoSemanal?.sabado),
      },
    };

    return res.json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "Falha ao buscar padrão semanal." });
  }
};

/** GET /clientes/padrao-semanal?padaria=<id> */
exports.padraoSemanalTodos = async (req, res) => {
  try {
    let padariaId =
      req.usuario?.role === "admin" ? req.query.padaria : req.usuario?.padaria;

    if (!padariaId || !mongoose.Types.ObjectId.isValid(padariaId)) {
      return res.status(400).json({ erro: "Padaria não informada/ inválida." });
    }

    const clientes = await Cliente.find({ padaria: padariaId })
      .sort({ nome: 1 })
      .populate(popPaths)
      .lean();

    const out = clientes.map((cli) => ({
      clienteId: String(cli._id),
      nome: cli.nome,
      inicioCicloFaturamento: cli.inicioCicloFaturamento,
      padraoSemanal: {
        domingo: normDia(cli.padraoSemanal?.domingo),
        segunda: normDia(cli.padraoSemanal?.segunda),
        terca: normDia(cli.padraoSemanal?.terca),
        quarta: normDia(cli.padraoSemanal?.quarta),
        quinta: normDia(cli.padraoSemanal?.quinta),
        sexta: normDia(cli.padraoSemanal?.sexta),
        sabado: normDia(cli.padraoSemanal?.sabado),
      },
    }));

    return res.json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "Falha ao listar padrões semanais." });
  }
};

/** GET /clientes/:id/basico  (ADMIN/GERENTE) */
exports.getClienteBasico = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ erro: "ID inválido." });
    }

    const cli = await Cliente.findById(id)
      .select("nome endereco rota telefone email observacoes location padaria")
      .lean();

    if (!cli) return res.status(404).json({ erro: "Cliente não encontrado." });

    // gerente só pode ver cliente da própria padaria
    if (
      req.usuario?.role === "gerente" &&
      String(cli.padaria) !== String(req.usuario.padaria)
    ) {
      return res.status(403).json({
        erro: "Gerente só pode consultar clientes da própria padaria.",
      });
    }

    return res.json({
      id: String(cli._id),
      nome: cli.nome,
      endereco: cli.endereco || "",
      rota: cli.rota || "",
      telefone: cli.telefone || "",
      email: cli.email || "",
      observacoes: cli.observacoes || "",
      location: cli.location || null,
    });
  } catch (e) {
    console.error("getClienteBasico:", e);
    return res.status(500).json({ erro: "Falha ao buscar dados do cliente." });
  }
};

/** PATCH /clientes/:id/observacoes  (ADMIN/GERENTE) */
exports.atualizarObservacoes = async (req, res) => {
  try {
    const { id } = req.params;
    const { observacoes } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ erro: "ID inválido." });
    }

    const cli = await Cliente.findById(id);
    if (!cli) return res.status(404).json({ erro: "Cliente não encontrado." });

    if (
      req.usuario?.role === "gerente" &&
      String(cli.padaria) !== String(req.usuario.padaria)
    ) {
      return res
        .status(403)
        .json({ erro: "Gerente só pode editar clientes da própria padaria." });
    }

    cli.observacoes = typeof observacoes === "string" ? observacoes.trim() : "";
    await cli.save();

    return res.json({ ok: true, observacoes: cli.observacoes });
  } catch (e) {
    console.error("atualizarObservacoes:", e);
    return res.status(500).json({ erro: "Falha ao salvar observações." });
  }
};

/* ---------- utilitário para o modal: rotas distintas da padaria ---------- */
/** GET /clientes/rotas/distintas
 * admin -> exige ?padaria=<id>
 * gerente/atendente -> padaria do usuário
 */
exports.rotasDistintas = async (req, res) => {
  try {
    const { role, padaria: padariaUser } = req.usuario || {};
    const { padaria: padariaQuery } = req.query;

    let padariaFiltro = null;
    if (role === "admin") {
      if (!padariaQuery)
        return res
          .status(400)
          .json({ erro: "Para admin, informe ?padaria=<id>." });
      padariaFiltro = toObjectIdIfValid(padariaQuery);
    } else if (role === "gerente" || role === "atendente") {
      if (!padariaUser)
        return res.status(400).json({ erro: "Usuário sem padaria." });
      padariaFiltro = toObjectIdIfValid(padariaUser);
    } else {
      return res
        .status(403)
        .json({ erro: "Apenas administradores, gerentes ou atendentes." });
    }

    const rotas = await Cliente.distinct("rota", { padaria: padariaFiltro });
    const saida = (rotas || [])
      .filter(Boolean)
      .map((r) => String(r).toUpperCase())
      .sort((a, b) => a.localeCompare(b, "pt-PT"));

    res.json(saida);
  } catch (e) {
    console.error("rotasDistintas:", e);
    res.status(500).json({ erro: "Erro ao listar rotas." });
  }
};
