// server.js

const express = require ('express');
const {Pool} = require ('pg');
const cors = require ('cors');
const dotenv = require ('dotenv');
const {createClient} = require ('@supabase/supabase-js');
const {v4: uuidv4} = require ('uuid');

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config ();

const app = express ();
const port = process.env.PORT || 3001;

// Middleware para habilitar CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://add-creche-bac.onrender.com',
];

app.use (
  cors ({
    origin: (origin, callback) => {
      if (!origin) return callback (null, true);
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
// 1. CONEXÃO COM O BANCO DE DADOS POSTGRESQL
// ----------------------------------------------------------------------

let db;

try {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error (
      'DATABASE_URL não está configurada nas variáveis de ambiente.'
    );
  }

  db = new Pool ({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    family: 4,
  });

  db
    .connect ()
    .then (() => {
      console.log ('Conexão bem-sucedida ao PostgreSQL de produção!');
    })
    .catch (err => {
      console.error ('ERRO: Falha ao conectar ao PostgreSQL:', err);
    });
} catch (error) {
  console.error (
    'Erro na inicialização da conexão com o banco de dados:',
    error.message
  );
}

// ----------------------------------------------------------------------
// 2. CONEXÃO COM O CLIENTE SUPABASE ADMIN
// ----------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseKey) {
  const supabaseAdmin = createClient (supabaseUrl, supabaseKey, {
    auth: {
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
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  // Nota: o Frontend ainda envia `contaCorrente`, mas o Backend salva em `conta_corrente`
  const {nome, email, telefone, codigo, contaCorrente} = req.body;

  if (!nome || !codigo) {
    return res
      .status (400)
      .json ({error: 'Nome e Código do cliente são obrigatórios.'});
  }

  try {
    const id = uuidv4 ();

    // Query corrigida para usar snake_case: conta_corrente
    const query =
      'INSERT INTO clientes (id, nome, email, telefone, codigo, conta_corrente) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
    const values = [id, nome, email, telefone, codigo, contaCorrente];

    const result = await db.query (query, values);

    // Mapeamento para garantir que o Frontend receba a chave correta
    const row = result.rows[0];
    const cliente = {
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      codigo: row.codigo,
      contaCorrente: row.conta_corrente, // Mapeia conta_corrente para contaCorrente
    };

    res.status (201).json (cliente);
  } catch (err) {
    console.error ('Erro ao salvar cliente (POST):', err.message);
    res.status (500).json ({
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

  const {id} = req.params;
  const {nome, email, telefone, codigo, contaCorrente} = req.body;

  if (!nome || !codigo) {
    return res
      .status (400)
      .json ({
        error: 'Nome e Código do cliente são obrigatórios para atualização.',
      });
  }

  try {
    // Query corrigida para usar snake_case: conta_corrente
    const query = `
            UPDATE clientes
            SET nome = $1, email = $2, telefone = $3, codigo = $4, conta_corrente = $5
            WHERE id = $6 
            RETURNING *;
        `;
    const values = [nome, email, telefone, codigo, contaCorrente, id];

    const result = await db.query (query, values);

    if (result.rowCount === 0) {
      return res
        .status (404)
        .json ({error: 'Cliente não encontrado para atualização.'});
    }

    const row = result.rows[0];
    const cliente = {
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      codigo: row.codigo,
      contaCorrente: row.conta_corrente, // Mapeia para o Frontend
    };

    res.json (cliente);
  } catch (err) {
    console.error ('Erro ao atualizar cliente (PUT):', err.message);
    res.status (500).json ({
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
    // Query corrigida para usar snake_case: conta_corrente
    const result = await db.query (
      'SELECT id, nome, email, telefone, codigo, conta_corrente FROM clientes ORDER BY nome ASC'
    );

    // Mapeamento para garantir que o Frontend receba as chaves em camelCase
    const clientesMapeados = result.rows.map (row => ({
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      codigo: row.codigo,
      contaCorrente: row.conta_corrente, // Mapeia para o Frontend
    }));

    res.json (clientesMapeados);
  } catch (err) {
    console.error ('Erro ao buscar clientes (GET):', err.message);
    res.status (500).json ({
      error: 'Erro interno do servidor ao buscar clientes.',
      detail: err.message,
    });
  }
});

// ----------------------------------------------------------------------
// 4. ROTAS CRUD COBRANÇAS
// ----------------------------------------------------------------------

// Rota para BUSCAR todas as cobranças (GET)
app.get ('/api/cobrancas', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  try {
    // Query corrigida para usar snake_case: cliente_id, status_remessa
    const result = await db.query (`
            SELECT id, cliente_id, descricao, valor, vencimento, status, status_remessa, nsa_remessa 
            FROM cobrancas 
            ORDER BY vencimento DESC
        `);

    // Mapeamento para garantir que o Frontend receba as chaves em camelCase
    const cobrancasMapeadas = result.rows.map (row => ({
      id: row.id,
      clienteId: row.cliente_id, // Mapeia para o Frontend
      descricao: row.descricao,
      valor: row.valor,
      vencimento: row.vencimento,
      status: row.status,
      statusRemessa: row.status_remessa, // Mapeia para o Frontend
      nsa_remessa: row.nsa_remessa,
    }));

    res.json (cobrancasMapeadas);
  } catch (err) {
    console.error ('Erro ao buscar cobranças (GET):', err.message);
    res.status (500).json ({
      error: 'Erro interno do servidor ao buscar cobranças.',
      detail: err.message,
    });
  }
});

// Rota para CRIAR uma nova cobrança (POST)
app.post ('/api/cobrancas', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  const {clienteId, descricao, valor, vencimento, status} = req.body;

  if (!clienteId || !descricao || !valor || !vencimento) {
    return res.status (400).json ({error: 'Campos obrigatórios faltando.'});
  }

  try {
    const id = uuidv4 ();

    // Query corrigida para usar snake_case: cliente_id, status_remessa
    const query =
      'INSERT INTO cobrancas (id, cliente_id, descricao, valor, vencimento, status, status_remessa, nsa_remessa) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *';
    const values = [
      id,
      clienteId,
      descricao,
      valor,
      vencimento,
      status || 'Pendente',
      'N/A',
      null,
    ];

    const result = await db.query (query, values);

    // Mapeamento para garantir que o Frontend receba a chave correta
    const row = result.rows[0];
    const cobranca = {
      id: row.id,
      clienteId: row.cliente_id, // Mapeia para o Frontend
      descricao: row.descricao,
      valor: row.valor,
      vencimento: row.vencimento,
      status: row.status,
      statusRemessa: row.status_remessa, // Mapeia para o Frontend
      nsa_remessa: row.nsa_remessa,
    };

    res.status (201).json (cobranca);
  } catch (err) {
    console.error ('Erro ao salvar cobrança (POST):', err.message);
    res.status (500).json ({
      error: 'Erro interno do servidor ao salvar cobrança.',
      detail: err.message,
    });
  }
});

// Rota para ATUALIZAR uma cobrança existente (PUT)
app.put ('/api/cobrancas/:id', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  const {id} = req.params;
  const {clienteId, descricao, valor, vencimento, status} = req.body;

  if (!clienteId || !descricao || !valor || !vencimento) {
    return res.status (400).json ({error: 'Campos obrigatórios faltando.'});
  }

  try {
    // Query corrigida para usar snake_case: cliente_id
    const query = `
            UPDATE cobrancas
            SET cliente_id = $1, descricao = $2, valor = $3, vencimento = $4, status = $5
            WHERE id = $6 
            RETURNING *;
        `;
    const values = [clienteId, descricao, valor, vencimento, status, id];

    const result = await db.query (query, values);

    if (result.rowCount === 0) {
      return res
        .status (404)
        .json ({error: 'Cobrança não encontrada para atualização.'});
    }

    const row = result.rows[0];
    const cobranca = {
      id: row.id,
      clienteId: row.cliente_id, // Mapeia para o Frontend
      descricao: row.descricao,
      valor: row.valor,
      vencimento: row.vencimento,
      status: row.status,
      statusRemessa: row.status_remessa, // Mapeia para o Frontend
      nsa_remessa: row.nsa_remessa,
    };

    res.json (cobranca);
  } catch (err) {
    console.error ('Erro ao atualizar cobrança (PUT):', err.message);
    res.status (500).json ({
      error: 'Erro interno do servidor ao atualizar cobrança.',
      detail: err.message,
    });
  }
});

// Rota para DELETAR uma cobrança (DELETE)
app.delete ('/api/cobrancas/:id', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  const {id} = req.params;

  try {
    const query = 'DELETE FROM cobrancas WHERE id = $1;';
    const values = [id];

    const result = await db.query (query, values);

    if (result.rowCount === 0) {
      return res
        .status (404)
        .json ({error: 'Cobrança não encontrada para exclusão.'});
    }

    res.status (204).send ();
  } catch (err) {
    console.error ('Erro ao deletar cobrança (DELETE):', err.message);
    res.status (500).json ({
      error: 'Erro interno do servidor ao deletar cobrança.',
      detail: err.message,
    });
  }
});

// ----------------------------------------------------------------------
// 5. ROTAS DE CONFIGURAÇÃO E AÇÕES
// ----------------------------------------------------------------------

// Rota para BUSCAR as configurações (GET)
app.get ('/api/config', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  try {
    // Query corrigida para usar snake_case
    const result = await db.query (
      'SELECT id, ultimo_nsa_sequencial, parte_fixa_nsa FROM configuracoes WHERE id = 1'
    );

    if (result.rows.length === 0) {
      // Se não houver configuração, insere
      await db.query (
        "INSERT INTO configuracoes (id, ultimo_nsa_sequencial, parte_fixa_nsa) VALUES (1, 0, '04') ON CONFLICT (id) DO NOTHING"
      );

      // Tenta buscar novamente
      const retryResult = await db.query (
        'SELECT id, ultimo_nsa_sequencial, parte_fixa_nsa FROM configuracoes WHERE id = 1'
      );

      const row = retryResult.rows[0];
      const config = {
        id: row.id,
        ultimoNsaSequencial: row.ultimo_nsa_sequencial, // Mapeia para o Frontend
        parteFixaNsa: row.parte_fixa_nsa, // Mapeia para o Frontend
      };

      return res.json (config);
    }

    const row = result.rows[0];
    const config = {
      id: row.id,
      ultimoNsaSequencial: row.ultimo_nsa_sequencial, // Mapeia para o Frontend
      parteFixaNsa: row.parte_fixa_nsa, // Mapeia para o Frontend
    };

    res.json (config);
  } catch (err) {
    console.error ('Erro ao buscar config (GET):', err.message);
    res.status (500).json ({
      error: 'Erro interno do servidor ao buscar configurações.',
      detail: err.message,
    });
  }
});

// Rota para ATUALIZAR as configurações (PUT)
app.put ('/api/config/:id', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  const {id} = req.params;
  // O Frontend envia `ultimoNsaSequencial`
  const {ultimoNsaSequencial} = req.body;

  if (typeof ultimoNsaSequencial === 'undefined') {
    return res
      .status (400)
      .json ({error: 'O campo ultimoNsaSequencial é obrigatório.'});
  }

  try {
    // Query corrigida para usar snake_case
    const query = `
            UPDATE configuracoes
            SET ultimo_nsa_sequencial = $1
            WHERE id = $2
            RETURNING *;
        `;
    const values = [ultimoNsaSequencial, id];

    const result = await db.query (query, values);

    if (result.rowCount === 0) {
      return res
        .status (404)
        .json ({error: 'Configuração não encontrada para atualização.'});
    }

    const row = result.rows[0];
    const config = {
      id: row.id,
      ultimoNsaSequencial: row.ultimo_nsa_sequencial, // Mapeia para o Frontend
      parteFixaNsa: row.parte_fixa_nsa, // Mapeia para o Frontend
    };

    res.json (config);
  } catch (err) {
    console.error ('Erro ao atualizar config (PUT):', err.message);
    res.status (500).json ({
      error: 'Erro interno do servidor ao atualizar config.',
      detail: err.message,
    });
  }
});

// Rota para MARCAR cobranças como processadas na remessa (POST)
app.post ('/api/marcar-remessa', async (req, res) => {
  if (!db)
    return res
      .status (500)
      .send ('Servidor sem conexão ativa com o banco de dados.');

  const {idsParaMarcar, nsaDaRemessa} = req.body;

  if (!Array.isArray (idsParaMarcar) || !nsaDaRemessa) {
    return res
      .status (400)
      .json ({error: 'IDs e NSA da remessa são obrigatórios.'});
  }

  try {
    const idList = idsParaMarcar.map (id => `'${id}'`).join (', ');

    // Query corrigida para usar snake_case
    const query = `
            UPDATE cobrancas
            SET nsa_remessa = $1, status_remessa = 'Processado'
            WHERE id IN (${idList})
            RETURNING id;
        `;
    const values = [nsaDaRemessa];

    const result = await db.query (query, values);

    res.json ({
      message: `Marcadas ${result.rowCount} cobranças para o NSA ${nsaDaRemessa}.`,
    });
  } catch (err) {
    console.error ('Erro ao marcar remessa (POST):', err.message);
    res.status (500).json ({
      error: 'Erro interno do servidor ao marcar remessa.',
      detail: err.message,
    });
  }
});

// ----------------------------------------------------------------------
// 6. INICIALIZAÇÃO DO SERVIDOR
// ----------------------------------------------------------------------

app.listen (port, () => {
  console.log (`🚀 Servidor rodando em http://localhost:${port}`);
  console.log (`Modo de Produção: Usando PostgreSQL.`);
});
