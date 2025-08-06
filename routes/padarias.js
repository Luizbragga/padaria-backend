const express = require("express");
const router = express.Router();
const Padaria = require("../models/Padaria");

const padariasController = require("../controllers/padariasController");
const autenticar = require("../middlewares/autenticacao");
const autorizar = require("../middlewares/autorizar");

// Rota de criação (mantida)
router.post("/", autenticar, autorizar("admin"), async (req, res) => {
  try {
    const novaPadaria = await Padaria.create(req.body);
    res.status(201).json(novaPadaria);
  } catch (erro) {
    res
      .status(400)
      .json({ mensagem: "Erro ao criar padaria", erro: erro.message });
  }
});

// ✅ Nova rota de listagem
router.get(
  "/",
  autenticar,
  autorizar("admin"),
  padariasController.listarPadarias
);
router.get(
  "/:id/usuarios",
  autenticar,
  autorizar("admin"),
  padariasController.listarUsuariosPorPadaria
);
// Desativar padaria
router.patch(
  "/:id/desativar",
  autenticar,
  autorizar("admin"),
  async (req, res) => {
    try {
      const padaria = await Padaria.findById(req.params.id);
      if (!padaria)
        return res.status(404).json({ erro: "Padaria não encontrada." });

      padaria.ativa = false;
      await padaria.save();

      res.json({ mensagem: "Padaria desativada com sucesso.", padaria });
    } catch (err) {
      res.status(500).json({ erro: "Erro ao desativar padaria." });
    }
  }
);

// Ativar padaria
router.patch(
  "/:id/ativar",
  autenticar,
  autorizar("admin"),
  async (req, res) => {
    try {
      const padaria = await Padaria.findById(req.params.id);
      if (!padaria)
        return res.status(404).json({ erro: "Padaria não encontrada." });

      padaria.ativa = true;
      await padaria.save();

      res.json({ mensagem: "Padaria ativada com sucesso.", padaria });
    } catch (err) {
      res.status(500).json({ erro: "Erro ao ativar padaria." });
    }
  }
);
// Deletar padaria (apenas admin)
router.delete("/:id", autenticar, autorizar("admin"), async (req, res) => {
  try {
    const padaria = await Padaria.findById(req.params.id);
    if (!padaria) {
      return res.status(404).json({ erro: "Padaria não encontrada." });
    }

    await Padaria.deleteOne({ _id: req.params.id });

    res.json({ mensagem: "Padaria excluída permanentemente." });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao excluir padaria." });
  }
});
module.exports = router;
