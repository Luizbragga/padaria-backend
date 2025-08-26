const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar"); // usado no force-release
const Entrega = require("../models/Entrega");
const Cliente = require("../models/Cliente");
const RotaDia = require("../models/RotaDia");

/* =========================
   Utilidades de data (hoje)
   ========================= */
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

/* =====================================
   GET /rotas/disponiveis
   Lista rotas reais (via Cliente.rota)
   com contagem de pendentes no dia.
   ===================================== */
router.get("/disponiveis", async (req, res) => {
  try {
    const padariaId = req.usuario?.padaria;
    if (!padariaId)
      return res.status(400).json({ erro: "Usuário sem padaria" });

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    const { ini, fim } = hojeRange();
    const data = dataHojeLocal();

    // rotas cadastradas via clientes
    const rotas = await Cliente.distinct("rota", { padaria });

    const locks = await RotaDia.find({ padaria, data })
      .populate("entregador", "nome")
      .lean();

    const saida = [];
    for (const rota of rotas) {
      // clientes dessa rota
      const idsClientes = await Cliente.find(
        { padaria, rota },
        { _id: 1 }
      ).lean();
      const clienteIds = idsClientes.map((c) => c._id);

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

      const lock = locks.find(
        (l) => String(l.rota).toUpperCase() === String(rota).toUpperCase()
      );
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
            entregador = lock.entregador?.nome || String(lock.entregador);
          }
        }
      }

      const ocupadaPorMim =
        lock?.entregador && String(lock.entregador) === String(req.usuario?.id);

      saida.push({
        rota: String(rota).toUpperCase(),
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
   POST /rotas/claim  { rota }
   Trava a rota (lock) e atribui entregas
   do dia **sem entregador** (ou já minhas).
   Se stale, também pega as do antigo dono.
   ===================================== */
router.post("/claim", async (req, res) => {
  try {
    const usuarioId = req.usuario?.id;
    const padariaId = req.usuario?.padaria;
    const entregadorNome = req.usuario?.nome || "";
    const rota = String(req.body?.rota || "")
      .toUpperCase()
      .trim();

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
        return res
          .status(409)
          .json({
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
      lock.entregadorNome = entregadorNome;
      lock.lastSeenAt = now;
      lock.status = "ocupada";
      lock.historico = lock.historico || [];
      lock.historico.push({ entregador: usuarioId, inicio: now });
      if (!lock.claimedAt) lock.claimedAt = now;
    }
    await lock.save();

    // ATRIBUIR ENTREGAS (apenas do dia):
    //  - se não stale: somente as com entregador: null ou já minhas
    //  - se stale: também as do antigo dono
    const { ini, fim } = hojeRange();
    const idsClientes = await Cliente.find(
      { padaria, rota },
      { _id: 1 }
    ).lean();
    const clienteIds = idsClientes.map((c) => c._id);

    if (clienteIds.length) {
      const orOwners = [{ entregador: null }, { entregador: usuarioId }];
      if (staleHolderId) orOwners.push({ entregador: staleHolderId });

      await Entrega.updateMany(
        {
          padaria,
          cliente: { $in: clienteIds },
          entregue: { $in: [false, null] },
          $or: [
            { createdAt: { $gte: ini, $lt: fim } },
            { dataEntrega: { $gte: ini, $lt: fim } },
            { data: { $gte: ini, $lt: fim } },
            { horaPrevista: { $gte: ini, $lt: fim } },
          ],
          $or: orOwners,
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
   POST /rotas/release
   Libera lock do dia e DESATRIBUI
   as pendentes do entregador.
   ===================================== */
router.post("/release", async (req, res) => {
  try {
    const usuarioId = req.usuario?.id;
    const padariaId = req.usuario?.padaria;
    if (!usuarioId || !padariaId) {
      return res.status(400).json({ erro: "Dados insuficientes" });
    }

    const padaria = mongoose.Types.ObjectId.isValid(padariaId)
      ? new mongoose.Types.ObjectId(padariaId)
      : padariaId;

    const data = dataHojeLocal();
    const now = new Date();

    const lock = await RotaDia.findOne({
      padaria,
      data,
      entregador: usuarioId,
    });
    if (!lock) return res.json({ ok: true, liberado: false });

    // fecha período corrente no histórico
    const last = lock.historico?.[lock.historico.length - 1];
    if (last && !last.fim) last.fim = now;

    lock.entregador = null;
    lock.entregadorNome = undefined;
    lock.lastSeenAt = null;
    lock.status = "livre";
    await lock.save();

    // desatribui entregas pendentes desse entregador (do dia) nessa rota
    const { ini, fim } = hojeRange();
    const idsClientes = await Cliente.find(
      { padaria, rota: lock.rota },
      { _id: 1 }
    ).lean();
    const clienteIds = idsClientes.map((c) => c._id);

    if (clienteIds.length) {
      await Entrega.updateMany(
        {
          padaria,
          cliente: { $in: clienteIds },
          entregue: { $in: [false, null] },
          entregador: usuarioId,
          $or: [
            { createdAt: { $gte: ini, $lt: fim } },
            { dataEntrega: { $gte: ini, $lt: fim } },
            { data: { $gte: ini, $lt: fim } },
            { horaPrevista: { $gte: ini, $lt: fim } },
          ],
        },
        { $set: { entregador: null } }
      );
    }

    res.json({ ok: true, liberado: true, rota: lock.rota });
  } catch (err) {
    console.error("erro /rotas/release:", err);
    res.status(500).json({ erro: "Falha ao liberar rota" });
  }
});

/* =====================================
   POST /rotas/ping
   Mantém o lock “vivo”.
   ===================================== */
router.post("/ping", async (req, res) => {
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
            entregadorNome: null,
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
