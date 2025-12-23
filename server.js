// server.js

const express = require ('express');
const {Pool} = require ('pg');
const cors = require ('cors');
const dotenv = require ('dotenv');
const {createClient} = require ('@supabase/supabase-js');
const {v4: uuidv4} = require ('uuid'); // Para gerar IDs únicos se o Supabase não gerar automaticamente

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config ();

const app = express ();
const port = process.env.PORT || 3001; // Usa a porta 3001, ou a porta definida pelo Render

// Middleware para habilitar CORS
// Permite requisições do seu frontend (http://localhost:3000) e outras origens
const allowedOrigins = [
  'http://localhost:3000',
  'https://add-creche-bac.onrender.com', // Seu próprio domínio
];

app.use (
  cors ({
    origin: (origin, callback) => {
      // Permite requisições sem 'origin' (como apps ou ferramentas como Postman)
      if (!origin) return callback (null, true);
      // Verifica se a origem está na lista de permitidas
      if (allowedOrigins.indexOf (origin) === -1) {
        const msg = 'A política CORS para esta origem não permite acesso.';
        return callback (new Error (msg), false);
      }
      return callback (null, true);
    },
  })
);

// Middleware para processar JSON no corpo da requisição
app.use (express.json ());

// ----------------------------------------------------------------------
// 1. CONEXÃO COM O BANCO DE DADOS POSTGRESQL (usando Pooler do Supabase)
// ----------------------------------------------------------------------

let db;

try {
  // Configuração de conexão ao PostgreSQL via Pooler do Supabase
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error (
      'DATABASE_URL não está configurada nas variáveis de ambiente.'
    );
  }

  db = new Pool ({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false, // Aceita certificados autoassinados (necessário para alguns ambientes)
    },
    // Correção crítica para Render/Supabase Pooler: força o uso de IPv4
    // Evita o erro 'SCRAM-SERVER-FINAL-MESSAGE' (ou relacionados)
    family: 4,
  });

  // Tenta fazer a primeira conexão para validar as credenciais imediatamente
  db
    .connect ()
    .then (() => {
      console.log ('Conexão bem-sucedida ao PostgreSQL de produção!');
    })
    .catch (err => {
      console.error ('ERRO: Falha ao conectar ao PostgreSQL:', err);
      // Se falhar a conexão, o servidor pode continuar rodando, mas as rotas de DB falharão
    });
} catch (error) {
  console.error (
    'Erro na inicialização da conexão com o banco de dados:',
    error.message
  );
}

// ----------------------------------------------------------------------
// 2. CONEXÃO COM O CLIENTE SUPABASE ADMIN (Para autenticação e privilégios)
// ----------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseKey) {
  const supabaseAdmin = createClient (supabaseUrl, supabaseKey, {
    auth: {
      // Se precisar de auto-refresh de token do service role (geralmente não é necessário)
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  console.log ('Cliente Supabase Admin Inicializado.');
} else {
  console.warn (
    'Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY faltando. Funções Admin desativadas.'
  );
}

// ----------------------------------------------------------------------
// 3. ROTAS CRUD CLIENTES
// ----------------------------------------------------------------------

// Rota para CRIAR um novo cliente (POST)
app.post ('/api/clientes', async (req, res) => {
  // Verifica se a conexão com o DB foi estabelecida
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  const {nome, email, telefone} = req.body;

  // Simples validação de campos obrigatórios
  if (!nome) {
    return res.status (400).json ({error: 'O nome do cliente é obrigatório.'});
  }

  try {
    // Gera um UUID para o 'id' se o Supabase não estiver configurado para fazer isso automaticamente na tabela 'clientes'
    const id = uuidv4 ();

    // QUERY: Confere com a estrutura clientes(id, nome, email, telefone)
    const query =
      'INSERT INTO clientes (id, nome, email, telefone) VALUES ($1, $2, $3, $4) RETURNING *';
    const values = [id, nome, email, telefone];

    const result = await db.query (query, values);

    res.status (201).json (result.rows[0]); // Retorna o cliente criado (Status 201 Created)
  } catch (err) {
    console.error ('Erro ao salvar cliente (POST):', err.message);
    // Retorna o erro exato do DB no modo de desenvolvimento, ou um genérico em produção
    res
      .status (500)
      .json ({
        error: 'Erro interno do servidor ao salvar cliente.',
        detail: err.message,
      });
  }
});

// Rota para ATUALIZAR um cliente existente (PUT)
app.put ('/api/clientes/:id', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  const {id} = req.params; // Captura o ID da URL
  const {nome, email, telefone} = req.body;

  if (!nome) {
    return res
      .status (400)
      .json ({error: 'O nome do cliente é obrigatório para atualização.'});
  }

  try {
    // QUERY: Confere com a estrutura clientes(nome, email, telefone) e atualiza pelo ID
    const query = `
            UPDATE clientes
            SET nome = $1, email = $2, telefone = $3
            WHERE id = $4 
            RETURNING *;
        `;
    // Certifique-se de que o ID da URL está sendo passado como parâmetro na posição $4
    const values = [nome, email, telefone, id];

    const result = await db.query (query, values);

    if (result.rowCount === 0) {
      return res
        .status (404)
        .json ({error: 'Cliente não encontrado para atualização.'});
    }

    res.json (result.rows[0]); // Retorna o cliente atualizado
  } catch (err) {
    // O erro 'cite_start is not defined' foi corrigido aqui, usando apenas err.message
    console.error ('Erro ao atualizar cliente (PUT):', err.message);
    res
      .status (500)
      .json ({
        error: 'Erro interno do servidor ao atualizar cliente.',
        detail: err.message,
      });
  }
});

// Rota para BUSCAR todos os clientes (GET)
app.get ('/api/clientes', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  try {
    const result = await db.query (
      'SELECT id, nome, email, telefone FROM clientes ORDER BY nome ASC'
    );
    res.json (result.rows);
  } catch (err) {
    console.error ('Erro ao buscar clientes (GET):', err.message);
    res
      .status (500)
      .json ({
        error: 'Erro interno do servidor ao buscar clientes.',
        detail: err.message,
      });
  }
});

// ----------------------------------------------------------------------
// 4. INICIALIZAÇÃO DO SERVIDOR
// ----------------------------------------------------------------------

app.listen (port, () => {
  console.log (`🚀 Servidor rodando em http://localhost:${port}`);
  console.log (`Modo de Produção: Usando PostgreSQL.`);
});
