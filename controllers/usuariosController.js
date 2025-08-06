const Usuario = require("../models/Usuario");
const Joi = require("joi");

// Esquema de validação
const usuarioSchema = Joi.object({
  nome: Joi.string().required(),
  email: Joi.string().email().required(),
  senha: Joi.string().min(6).required(),
  role: Joi.string().valid("entregador", "gerente", "admin"),
  padaria: Joi.string().optional(),
});

exports.criarUsuario = async (req, res) => {
  try {
    // Valida os dados enviados
    const { error } = usuarioSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ erro: error.details[0].message });
    }

    // Prepara os dados para criação
    const dados = {
      ...req.body,
      padaria: req.usuario?.padaria || req.body.padaria,
    };

    // Cria o novo usuário
    const novoUsuario = await Usuario.create(dados);

    // Remove a senha da resposta
    const { senha, ...usuarioSemSenha } = novoUsuario.toObject();
    res.status(201).json(usuarioSemSenha);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ erro: "Email já cadastrado." });
    }
    res.status(500).json({ erro: "Erro ao registrar usuário." });
  }
};
