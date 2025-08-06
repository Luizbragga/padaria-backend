# Padaria Backend

Este é o backend do sistema de entregas para padarias. Ele gerencia a autenticação, controle de usuários, geração automática de entregas diárias, pagamentos, inadimplência e muito mais.

---

## Repositório do Frontend

O repositório do frontend deste sistema está disponível em:  
[https://github.com/Luizbragga/padaria-frontend](https://github.com/Luizbragga/padaria-frontend)

---

## Tecnologias utilizadas

- Node.js
- Express
- MongoDB (Mongoose)
- JWT (autenticação)
- Joi (validações)
- Dotenv
- Cron (tarefas agendadas)

---

## O que este backend faz

- Gera entregas diárias com base no padrão semanal de cada cliente
- Controla usuários com diferentes níveis de acesso: `admin`, `gerente`, `entregador`
- Registra pagamentos parciais, completos ou pendentes por entrega
- Detecta e exibe clientes inadimplentes
- Permite alteração de pedidos para um dia específico ou mudança no padrão semanal
- Gera estatísticas e relatórios analíticos para o painel do administrador e do gerente
- Registra problemas durante as entregas (cliente ausente, endereço incorreto, etc)
- Expõe uma API REST completa para comunicação com o frontend

---

## Autenticação e segurança

- O backend usa JWT (JSON Web Token) para autenticação de usuários.
- Após o login, o token JWT é gerado e deve ser enviado em todas as requisições protegidas.

### Exemplo de header:

Authorization: Bearer <seu_token_aqui>

### Controle de acesso por função (role):

Cada usuário possui uma `role` definida no banco de dados:

| Role         | Permissões                                                              |
| ------------ | ----------------------------------------------------------------------- |
| `admin`      | Acesso total: usuários, padarias, entregas, relatórios e estatísticas   |
| `gerente`    | Controle de entregas, pagamentos, inadimplência, alterações de pedido   |
| `entregador` | Visualiza e atualiza apenas suas entregas do dia (inclui mapa e status) |

---

## Comunicação com o frontend

O frontend se comunica com este backend via API REST, enviando e recebendo dados em formato JSON.

### Principais endpoints disponíveis:

| Método | Rota                       | Descrição                                         |
| ------ | -------------------------- | ------------------------------------------------- |
| POST   | `/login`                   | Login de usuário e geração de token JWT           |
| GET    | `/entregas/hoje`           | Lista de entregas do dia para o entregador logado |
| PUT    | `/entregas/:id/concluir`   | Marcar uma entrega como concluída                 |
| POST   | `/entregas/:id/pagamento`  | Registrar pagamento de uma entrega                |
| GET    | `/analitico/inadimplentes` | Listar clientes inadimplentes da padaria          |
| PUT    | `/entregas/:id/problema`   | Relatar problema em uma entrega                   |
| GET    | `/usuarios/me`             | Buscar os dados do usuário logado                 |
| ...    | ...                        | (Outras rotas disponíveis na API)                 |

> Todas as requisições protegidas devem conter o token JWT no header `Authorization`.

## `

## Como rodar o projeto localmente

1. **Clone este repositório:**

```bash
git clone https://github.com/Luizbragga/padaria-backend.git
```

2. **Acesse a pasta:**

```bash
cd padaria-backend
```

3. **Instale as dependências:**

```bash
npm install
```

4. **Crie um arquivo `.env` baseado no `.env.example`:**

```env
MONGO_URI= # sua string do MongoDB
JWT_SECRET= # sua chave secreta do token
PORT=3000
```

5. **Inicie o servidor:**

```bash
npm start
```

O backend estará rodando localmente em:  
`http://localhost:3000`

---

## Estrutura do projeto

padaria-backend/
├── config/ # Conexão com MongoDB e variáveis de ambiente
├── controllers/ # Lógica de cada rota (entregas, usuários, etc)
├── middlewares/ # Autenticação, controle de acesso
├── models/ # Schemas do Mongoose (MongoDB)
├── routes/ # Rotas organizadas por entidade
├── validations/ # Validação de dados com Joi
├── jobs/ # Tarefas automáticas como geração de entregas
├── utils/ # Funções utilitárias reutilizáveis
├── .env.example # Exemplo de variáveis de ambiente
├── .gitignore # Arquivos ignorados pelo Git
├── index.js # Ponto de entrada da aplicação
└── package.json # Dependências e scripts do projeto

---

## Status do projeto

Backend funcional  
 Frontend em desenvolvimento  
 Pronto para integração total e uso em ambiente real

---

## Contato

Caso queira saber mais, testar o sistema, contratar ou colaborar:

**Luiz Braga**  
 luizbraga@gmail.com  
 https://www.linkedin.com/in/luiz-henrique-333214287/
