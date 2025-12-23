// server.js

// 1. CARREGAR VARIÁVEIS DE AMBIENTE
// 1. IMPORTAÇÕES
const express = require ('express');
const cors = require ('cors'); // Para resolver o erro CORS
const {Client} = require ('pg');
const {createClient} = require ('@supabase/supabase-js');
const dotenv = require ('dotenv');

// Carrega variáveis de ambiente do .env, se estiver em ambiente local
dotenv.config ();

const app = express ();
const port = process.env.PORT || 3000;
app.use (express.json ());

// 2. CONFIGURAÇÃO DE CORS
// Esta é a alteração crucial para permitir que o frontend (http://localhost:3001)
// se conecte ao backend no Render (https://add-creche-bac.onrender.com)
const allowedOrigins = [
  'http://localhost:3000', // Permite o desenvolvimento local do frontend
  'https://add-creche-bac.onrender.com', // Opcional: Permite a si mesmo, ou adicione o domínio do seu frontend de produção aqui
];

app.use (
  cors ({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  })
);

// 3. VARIÁVEIS DE AMBIENTE E SUPABASE CLIENT ADMIN
const connectionUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inicializa o cliente Supabase (para uso como Admin/Service Role)
const supabase = createClient (supabaseUrl, supabaseKey);
console.log ('Cliente Supabase Admin Inicializado.');

// 4. CONFIGURAÇÃO E CONEXÃO POSTGRESQL (CRÍTICO)
let db;

if (process.env.NODE_ENV === 'production') {
  console.log ('Modo de Produção: Usando PostgreSQL.');
  db = new Client ({
    connectionString: connectionUrl,
    ssl: {
      rejectUnauthorized: false,
    },
    // CORREÇÃO CRÍTICA: Força o uso de IPv4 para compatibilidade com Render/Supabase
    family: 4,
  });

  db
    .connect ()
    .then (() =>
      console.log ('Conexão bem-sucedida ao PostgreSQL de produção!')
    )
    .catch (err =>
      console.error ('ERRO: Falha ao conectar ao PostgreSQL:', err)
    );
} else {
  // Modo de desenvolvimento local (se você usar o .env localmente)
  console.log ('Modo de Desenvolvimento: Usando mock ou conexão local.');
  // db = ... conexão local ou mock de dados.
}

// 5. ROTA DE TESTE BÁSICA
app.get ('/', (req, res) => {
  res.send ('API Add-Creche está rodando!');
});

// 6. ROTAS DE CLIENTES (EXEMPLO)
app.get ('/api/clientes', async (req, res) => {
  if (!db) return res.status (500).send ('Banco de dados não conectado.');
  try {
    // Exemplo de consulta usando o cliente 'pg'
    const result = await db.query ('SELECT * FROM clientes');
    res.json (result.rows);
  } catch (err) {
    console.error ('Erro ao buscar clientes:', err);
    res
      .status (500)
      .json ({error: 'Erro interno do servidor ao buscar clientes.'});
  }
});

// Adicione aqui suas outras rotas (POST, PUT, DELETE, etc.)
// Adicione esta nova rota no seu server.js, logo após a rota GET /api/clientes

app.post ('/api/clientes', async (req, res) => {
  if (!db) return res.status (500).send ('Banco de dados não conectado.');

  // 1. Receber os dados do frontend
  const {nome, email, telefone} = req.body; // Adapte para os campos corretos

  if (!nome) {
    return res.status (400).json ({error: 'O nome do cliente é obrigatório.'});
  }

  try {
    // 2. Montar a query SQL (Exemplo de INSERT)
    const query =
      'INSERT INTO clientes (nome, email, telefone) VALUES ($1, $2, $3) RETURNING *';
    const values = [nome, email, telefone];

    // 3. Executar a inserção
    const result = await db.query (query, values);

    // 4. Retornar sucesso (201 Created)
    res.status (201).json (result.rows[0]);
  } catch (err) {
    console.error ('Erro ao salvar cliente:', err.message);
    // Retornar erro 500 para o frontend
    res
      .status (500)
      .json ({error: 'Erro interno do servidor ao salvar cliente.'});
  }
});

// Adicione esta rota de ATUALIZAÇÃO (PUT)

app.put ('/api/clientes/:id', async (req, res) => {
  if (!db) return res.status (500).send ('Banco de dados não conectado.');

  const {id} = req.params; // Captura o ID da URL (ex: '9')
  const {nome, email, telefone} = req.body; // Captura os dados do formulário

  if (!nome) {
    return res
      .status (400)
      .json ({error: 'O nome do cliente é obrigatório para atualização.'});
  }

  try {
    // Assume que a tabela clientes tem id (TEXT), nome, email e telefone
    const query = `
            UPDATE clientes
            SET nome = $1, email = $2, telefone = $3
            WHERE id = $4
            RETURNING *;
        `;
    [cite_start]; // O tipo da coluna 'id' no seu SQLite é TEXT[cite: 25], usamos aqui para a query.
    const values = [nome, email, telefone, id];

    const result = await db.query (query, values);

    if (result.rowCount === 0) {
      return res
        .status (404)
        .json ({error: 'Cliente não encontrado para atualização.'});
    }

    res.json (result.rows[0]); // Retorna o cliente atualizado
  } catch (err) {
    console.error ('Erro ao atualizar cliente:', err.message);
    res
      .status (500)
      .json ({error: 'Erro interno do servidor ao atualizar cliente.'});
  }
});

// 7. INICIALIZAÇÃO DO SERVIDOR
app.listen (port, () => {
  console.log (`🚀 Servidor rodando em http://localhost:${port}`);
});
