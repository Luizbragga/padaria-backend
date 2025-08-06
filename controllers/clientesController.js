const Cliente = require("../models/Cliente");
const Padaria = require("../models/Padaria");

exports.criarCliente = async (req, res) => {
  try {
    if (req.usuario.role !== "admin") {
      return res
        .status(403)
        .json({ erro: "Apenas administradores podem criar clientes." });
    }

    const { padaria, ...dadosCliente } = req.body;

    // Verifica se a padaria existe
    const existePadaria = await Padaria.findById(padaria);
    if (!existePadaria) {
      return res.status(400).json({ erro: "Padaria não encontrada." });
    }

    const novoCliente = new Cliente({
      ...dadosCliente,
      padaria,
    });

    await novoCliente.save();
    res.status(201).json(novoCliente);
  } catch (erro) {
    console.error("Erro ao criar cliente:", erro);
    res.status(500).json({ erro: "Erro ao criar cliente." });
  }
};
