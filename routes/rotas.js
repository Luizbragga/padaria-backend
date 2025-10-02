// padaria-backend/routes/rotas.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");
const RotaOverride = require("../models/RotaOverride");
const Entrega = require("../models/Entrega");
const Cliente = require("../models/Cliente");
const RotaDia = require("../models/RotaDia");
const Usuario = require("../models/Usuario");

const {
  nomesQuerySchema,
  claimBodySchema,
  forceReleaseBodySchema,
} = require("../validations/rotas");

// ========================= Utilidades de data (hoje) =========================

function dataHojeLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function hojeRange() {
  const ini = new Date();
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini);
  fim.setDate(ini.getDate() + 1);
  return { ini, fim };
}

const STALE_MINUTES = 10; // sem ping por X min ⇒ permite reassumir

// todas as rotas daqui exigem usuário autenticado
router.use(autenticar);
async function getClienteIdsConsiderandoOverride(padaria, rota) {
  const data = dataHojeLocal();

  const all = await RotaOverride.find({ padaria, data }).lean();
  const movedTo = new Set(
    all
      .filter((o) => String(o.novaRota).toUpperCase() === rota)
      .map((o) => String(o.cliente))
  );
  const movedOut = new Set(
    all
      .filter((o) => String(o.antigaRota).toUpperCase() === rota)
      .map((o) => String(o.cliente))
  );

  // clientes originalmente da rota (mas removendo os que foram movidos para fora)
  const base = await Cliente.find({ padaria, rota }, { _id: 1 }).lean();
  const keepBase = base
    .filter((c) => !movedOut.has(String(c._id)))
    .map((c) => c._id);

  // adiciona os que foram deslocados PARA esta rota
  for (const id of movedTo) {
    try {
      keepBase.push(new mongoose.Types.ObjectId(id));
    } catch {}
  }
  return keepBase;
}

/* =====================================
   GET /rotas/disponiveis  (somente entregador)
   Lista rotas reais (via Cliente.rota)
   com contagem de pendentes no dia.
   ===================================== */
router.get(
  "/nomes",
  autorizar("admin", "gerente", "atendente"),
  async (req, res) => {
    try {
      // padaria do usuário (gerente/atendente) ou vinda da query (admin)
      const role = req.usuario?.role;

      // valida query (bloqueia campos desconhecidos e checa id quando presente)
      const { error: qErr, value: qVal } = nomesQuerySchema.validate(
        req.query || {}
      );
      if (qErr) return res.status(400).json({ erro: qErr.details[0].message });

      const padariaId =
        role === "admin"
          ? qVal.padaria || req.usuario?.padaria
          : req.usuario?.padaria;

      if (!padariaId) {
        return res.status(400).json({ erro: "Padaria não informada" });
      }

      const padaria = mongoose.Types.ObjectId.isValid(padariaId)
        ? new mongoose.Types.ObjectId(padariaId)
        : padariaId;
      // distinct nos clientes
      const rotas = (await Cliente.distinct("rota", { padaria }))
        .filter(Boolean)
        .map((r) => String(r).toUpperCase())
        .sort();

      res.json(rotas);
    } catch (e) {
      console.error("erro /rotas/nomes:", e);
      res.status(500).json({ erro: "Falha ao listar rotas" });
    }
  }
);
router.get("/disponiveis", autorizar("entregador"), async (req, res) => {
  try {
    // padaria do usuário (gerente/atendente) ou vinda da query (admin)
    const role = req.usuario?.role;

    // valida query (bloqueia campos desconhecidos e checa id quando presente)
    const { error: qErr, value: qVal } = nomesQuerySchema.validate(
      req.query || {}
    );
    if (qErr) return res.status(400).json({ erro: qErr.details[0].message });

    const padariaId =
      role === "admin"
        ? qVal.padaria || req.usuario?.padaria
        : req.usuario?.padaria;

    if (!padariaId) {
      return res.status(400).json({ erro: "Padaria não informada" });
    }

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    const { ini, fim } = hojeRange();
    const data = dataHojeLocal();

    // rotas cadastradas via clientes
    const rotas = (await Cliente.distinct("rota", { padaria }))
      .filter(Boolean)
      .map((r) => String(r).toUpperCase());

    // locks do dia de uma vez
    const locks = await RotaDia.find({ padaria, data })
      .populate("entregador", "nome")
      .lean();

    const saida = [];
    for (const rota of rotas) {
      // clientes dessa rota
      const clientes = await Cliente.find({ padaria, rota }, { _id: 1 }).lean();
      const clienteIds = clientes.map((c) => c._id);

      // total pendentes (do dia) nessa rota
      const total = clienteIds.length
        ? await Entrega.countDocuments({
            padaria,
            cliente: { $in: clienteIds },
            entregue: { $in: [false, null] },
            $or: [
              { createdAt: { $gte: ini, $lt: fim } },
              { dataEntrega: { $gte: ini, $lt: fim } },
              { data: { $gte: ini, $lt: fim } },
              { horaPrevista: { $gte: ini, $lt: fim } },
            ],
          })
        : 0;

      const lock = locks.find((l) => String(l.rota).toUpperCase() === rota);

      let status = total === 0 ? "vazia" : "livre";
      let entregador = null;
      let stale = false;

      if (lock) {
        if (lock.status === "concluida") {
          status = "concluida";
        } else if (lock.entregador) {
          stale =
            lock.lastSeenAt &&
            Date.now() - new Date(lock.lastSeenAt).getTime() >
              STALE_MINUTES * 60 * 1000;

          if (stale) {
            status = "livre";
            entregador = null;
          } else {
            status = "ocupada";
            // pode vir populado (objeto) ou só id
            entregador =
              (lock.entregador && lock.entregador.nome) ||
              String(lock.entregador);
          }
        }
      }

      const ocupadaPorMim =
        lock?.entregador &&
        String(lock.entregador._id || lock.entregador) ===
          String(req.usuario?.id);

      saida.push({
        rota,
        total,
        status,
        entregador,
        stale,
        ocupadaPorMim,
      });
    }

    res.json(saida);
  } catch (err) {
    console.error("erro /rotas/disponiveis:", err);
    res.status(500).json({ erro: "Falha ao listar rotas" });
  }
});

/* =====================================
 POST /rotas/claim  { rota }   (somente entregador)
  Trava a rota (lock) e atribui entregas
   do dia **sem entregador** (ou já minhas).
   Se stale, também pega as do antigo dono.
   ===================================== */
router.post("/claim", autorizar("entregador"), async (req, res) => {
  try {
    const usuarioId = req.usuario?.id;
    const padariaId = req.usuario?.padaria;

    // valida body (rota obrigatória, sem campos extras)
    const { error: bErr, value: bVal } = claimBodySchema.validate(
      req.body || {}
    );
    if (bErr) return res.status(400).json({ erro: bErr.details[0].message });

    // normaliza rota (UPPER + trim), mantendo contrato
    const rota = String(bVal.rota || "")
      .toUpperCase()
      .trim();
    if (!rota) return res.status(400).json({ erro: "Informe a rota" });

    if (!usuarioId || !padariaId || !rota) {
      return res
        .status(400)
        .json({ erro: "Dados insuficientes para assumir rota" });
    }

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    const data = dataHojeLocal();
    const now = new Date();

    let lock = await RotaDia.findOne({ padaria, data, rota });

    if (!lock) {
      lock = await RotaDia.create({
        padaria,
        data,
        rota,
        entregador: null,
        status: "livre",
        claimedAt: now,
        lastSeenAt: now,
      });
    }

    if (lock.status === "concluida") {
      return res.status(409).json({ erro: "Rota já concluída hoje." });
    }

    let staleHolderId = null;

    if (lock.entregador && String(lock.entregador) !== String(usuarioId)) {
      const isStale =
        lock.lastSeenAt &&
        now.getTime() - new Date(lock.lastSeenAt).getTime() >
          STALE_MINUTES * 60 * 1000;

      if (!isStale) {
        return res.status(409).json({
          erro: "Rota já em execução, por favor selecione outra rota.",
        });
      }

      // liberar lock stale (guardando dono anterior)
      staleHolderId = String(lock.entregador);
      lock.historico = lock.historico || [];
      const last = lock.historico[lock.historico.length - 1];
      if (last && !last.fim) last.fim = now;
      lock.entregador = null;
    }

    // assumir (ou renovar) por mim
    if (String(lock.entregador) === String(usuarioId)) {
      lock.lastSeenAt = now;
    } else {
      lock.entregador = usuarioId;
      lock.lastSeenAt = now;
      lock.status = "ocupada";
      lock.historico = lock.historico || [];
      lock.historico.push({ entregador: usuarioId, inicio: now });
      if (!lock.claimedAt) lock.claimedAt = now;
    }
    await lock.save();

    // marca rota atual no usuário (para o mapa do gerente)
    await Usuario.findByIdAndUpdate(usuarioId, { rotaAtual: rota });

    // Atribuir ENTREGAS do dia nessa rota
    const { ini, fim } = hojeRange();

    // >>> CORREÇÃO AQUI:
    const clientes = await Cliente.find({ padaria, rota }, { _id: 1 }).lean();
    const clienteIds = clientes.map((c) => c._id);

    if (clienteIds.length) {
      const orOwners = [{ entregador: null }, { entregador: usuarioId }];
      if (staleHolderId) orOwners.push({ entregador: staleHolderId });

      await Entrega.updateMany(
        {
          padaria,
          cliente: { $in: clienteIds },
          entregue: { $in: [false, null] },
          $and: [
            {
              $or: [
                { createdAt: { $gte: ini, $lt: fim } },
                { dataEntrega: { $gte: ini, $lt: fim } },
                { data: { $gte: ini, $lt: fim } },
                { horaPrevista: { $gte: ini, $lt: fim } },
              ],
            },
            { $or: orOwners },
          ],
        },
        { $set: { entregador: usuarioId } }
      );
    }

    return res.json({ ok: true, rota, lockId: lock._id });
  } catch (err) {
    console.error("erro /rotas/claim:", err);
    res.status(500).json({ erro: "Falha ao assumir rota" });
  }
});

/* =====================================
   POST /rotas/release   (somente entregador)
   Libera lock do dia e DESATRIBUI
   as pendentes do entregador.
   ===================================== */
router.post(
  "/force-release",
  autenticar,
  autorizar("admin", "gerente"),
  async (req, res) => {
    try {
      // valida body (rota obrigatória, sem campos extras)
      const { error: frErr, value: frVal } = forceReleaseBodySchema.validate(
        req.body || {}
      );
      if (frErr)
        return res.status(400).json({ erro: frErr.details[0].message });

      const rota = String(frVal.rota || "")
        .toUpperCase()
        .trim();
      if (!rota) return res.status(400).json({ erro: "Informe a rota" });

      const padariaId = req.usuario?.padaria;
      if (!padariaId)
        return res.status(400).json({ erro: "Usuário sem padaria" });

      const padaria = mongoose.Types.ObjectId.isValid(padariaId)
        ? new mongoose.Types.ObjectId(padariaId)
        : padariaId;

      const data = dataHojeLocal();

      await RotaDia.updateOne(
        { padaria, data, rota },
        {
          $set: {
            entregador: null,
            lastSeenAt: null,
            status: "livre",
          },
        },
        { upsert: true }
      );

      res.json({ ok: true, rota });
    } catch (e) {
      console.error("force-release error:", e);
      res.status(500).json({ erro: "Falha ao liberar rota" });
    }
  }
);

/* =====================================
   POST /rotas/ping   (somente entregador)
   Mantém o lock “vivo”.
   ===================================== */
router.post("/ping", autorizar("entregador"), async (req, res) => {
  try {
    const usuarioId = req.usuario?.id;
    const padariaId = req.usuario?.padaria;
    if (!usuarioId || !padariaId) return res.json({ ok: true });

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    const data = dataHojeLocal();

    await RotaDia.updateMany(
      { padaria, data, entregador: usuarioId },
      { $set: { lastSeenAt: new Date() } }
    );

    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

/* =====================================
   POST /rotas/force-release   (ADMIN/GERENTE)
   Destrava manualmente uma rota de hoje.
   ===================================== */
router.post(
  "/force-release",
  autenticar,
  autorizar("admin", "gerente"),
  async (req, res) => {
    try {
      const { rota } = req.body;
      if (!rota) return res.status(400).json({ erro: "Informe a rota" });

      const padariaId = req.usuario?.padaria;
      if (!padariaId)
        return res.status(400).json({ erro: "Usuário sem padaria" });

      const padaria = mongoose.Types.ObjectId.isValid(padariaId)
        ? new mongoose.Types.ObjectId(padariaId)
        : padariaId;

      const data = dataHojeLocal();

      await RotaDia.updateOne(
        { padaria, data, rota: String(rota).toUpperCase() },
        {
          $set: {
            entregador: null,
            lastSeenAt: null,
            status: "livre",
          },
        },
        { upsert: true }
      );

      res.json({ ok: true, rota: String(rota).toUpperCase() });
    } catch (e) {
      console.error("force-release error:", e);
      res.status(500).json({ erro: "Falha ao liberar rota" });
    }
  }
);

module.exports = router;
