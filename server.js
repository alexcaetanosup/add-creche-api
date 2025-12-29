// server.js - VERSÃO COM DIAGNÓSTICO COMPLETO DE CONEXÃO

const express = require ('express');
const {Pool} = require ('pg');
const cors = require ('cors');
const dotenv = require ('dotenv');
const {createClient} = require ('@supabase/supabase-js');
const {v4: uuidv4} = require ('uuid');

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config ();

const app = express ();

// CONFIGURAÇÃO DE PORTA MELHORADA
const PORT = process.env.PORT || 3001;

// Middleware para habilitar CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
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

// Middleware para log de requisições
app.use ((req, res, next) => {
  console.log (`📥 ${req.method} ${req.url}`);
  next ();
});

// ----------------------------------------------------------------------
// 1. DIAGNÓSTICO E CONEXÃO COM O BANCO DE DADOS POSTGRESQL
// ----------------------------------------------------------------------

let db;
let dbConnected = false;

console.log ('\n========================================');
console.log ('🔍 DIAGNÓSTICO DO BANCO DE DADOS');
console.log ('========================================\n');

// Verifica se a DATABASE_URL existe
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error ('❌ ERRO CRÍTICO: DATABASE_URL não encontrada!');
  console.log ('\n💡 SOLUÇÃO:');
  console.log ('1. Verifique se o arquivo .env existe na raiz do projeto');
  console.log ('2. O arquivo .env deve conter:');
  console.log ('   DATABASE_URL=postgresql://usuario:senha@host:porta/banco');
  console.log ('\nExemplo:');
  console.log (
    '   DATABASE_URL=postgresql://postgres:suasenha@localhost:5432/seu_banco\n'
  );
} else {
  console.log ('✅ DATABASE_URL encontrada');

  // Mostra a URL mascarada (esconde a senha)
  try {
    const url = new URL (connectionString);
    const maskedUrl = `${url.protocol}//${url.username}:****@${url.host}${url.pathname}`;
    console.log (`🔗 Conectando em: ${maskedUrl}`);
  } catch (e) {
    console.log ('⚠️  Formato da URL pode estar incorreto');
  }

  console.log ('\n🔄 Tentando conectar...\n');
}

async function initializeDatabase () {
  if (!connectionString) {
    console.error ('❌ Não é possível conectar sem DATABASE_URL');
    dbConnected = false;
    return;
  }

  try {
    db = new Pool ({
      connectionString: connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      family: 4,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Testa a conexão
    console.log ('🔌 Conectando ao PostgreSQL...');
    const client = await db.connect ();
    console.log ('✅ Conexão bem-sucedida ao PostgreSQL!');

    // Verifica a versão do PostgreSQL
    const versionResult = await client.query ('SELECT version()');
    console.log (
      `📌 PostgreSQL: ${versionResult.rows[0].version.split (',')[0]}`
    );

    // Verifica se as tabelas existem
    const tablesCheck = await client.query (`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('clientes', 'cobrancas', 'configuracoes')
      ORDER BY table_name;
    `);

    const foundTables = tablesCheck.rows.map (r => r.table_name);
    console.log (
      `📋 Tabelas encontradas: ${foundTables.length > 0 ? foundTables.join (', ') : 'NENHUMA'}`
    );

    if (foundTables.length === 0) {
      console.log ('\n⚠️  ATENÇÃO: Nenhuma tabela encontrada!');
      console.log ('💡 Execute o script SQL para criar as tabelas.');
      console.log ('   Veja as instruções no final deste log.\n');
    } else if (foundTables.length < 3) {
      console.log (`\n⚠️  ATENÇÃO: Faltam tabelas!`);
      console.log (`   Esperadas: clientes, cobrancas, configuracoes`);
      console.log (`   Encontradas: ${foundTables.join (', ')}\n`);
    }

    // Conta registros em cada tabela
    for (const table of foundTables) {
      try {
        const countResult = await client.query (
          `SELECT COUNT(*) FROM ${table}`
        );
        console.log (`   ${table}: ${countResult.rows[0].count} registros`);
      } catch (e) {
        console.log (`   ${table}: erro ao contar registros`);
      }
    }

    client.release ();
    dbConnected = true;

    console.log ('\n✅ BANCO DE DADOS PRONTO!\n');
    console.log ('========================================\n');
  } catch (error) {
    console.error ('\n❌ ERRO AO CONECTAR AO BANCO DE DADOS:');
    console.error ('========================================');
    console.error (`Tipo: ${error.code || 'Desconhecido'}`);
    console.error (`Mensagem: ${error.message}`);

    if (error.code === 'ENOTFOUND') {
      console.log ('\n💡 SOLUÇÃO:');
      console.log ('   O host do banco de dados não foi encontrado.');
      console.log ('   Verifique se o endereço do servidor está correto.\n');
    } else if (error.code === 'ECONNREFUSED') {
      console.log ('\n💡 SOLUÇÃO:');
      console.log ('   Conexão recusada. Possíveis causas:');
      console.log ('   - O PostgreSQL não está rodando');
      console.log ('   - A porta está incorreta');
      console.log ('   - Firewall bloqueando a conexão\n');
    } else if (error.code === '28P01') {
      console.log ('\n💡 SOLUÇÃO:');
      console.log ('   Senha incorreta.');
      console.log ('   Verifique o usuário e senha na DATABASE_URL\n');
    } else if (error.code === '3D000') {
      console.log ('\n💡 SOLUÇÃO:');
      console.log ('   Banco de dados não existe.');
      console.log ('   Crie o banco de dados antes de conectar.\n');
    }

    console.error ('\nStack completo:');
    console.error (error.stack);
    console.log ('\n========================================\n');

    dbConnected = false;
  }
}

// Inicializa o banco de dados
initializeDatabase ().catch (err => {
  console.error ('Erro fatal na inicialização:', err);
});

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
  console.log ('✅ Cliente Supabase Admin Inicializado.');
} else {
  console.warn (
    '⚠️  Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY faltando.'
  );
}

// ----------------------------------------------------------------------
// 3. MIDDLEWARE DE VERIFICAÇÃO DO BANCO
// ----------------------------------------------------------------------

function checkDatabase (req, res, next) {
  if (!db || !dbConnected) {
    console.error ('❌ Banco de dados não conectado');
    return res.status (500).json ({
      error: 'Servidor sem conexão ativa com o banco de dados.',
      detail: 'Verifique os logs do servidor para mais informações.',
      hint: 'Certifique-se de que a DATABASE_URL está configurada corretamente.',
    });
  }
  next ();
}

// ----------------------------------------------------------------------
// 4. ROTAS CRUD CLIENTES
// ----------------------------------------------------------------------

app.post ('/api/clientes', checkDatabase, async (req, res) => {
  console.log ('📦 Dados recebidos:', req.body);

  const {nome, email, telefone, codigo, contaCorrente} = req.body;

  if (!nome || !codigo) {
    console.log ('❌ Validação falhou - nome:', nome, 'codigo:', codigo);
    return res.status (400).json ({
      error: 'Nome e Código do cliente são obrigatórios.',
      recebido: {nome, codigo},
    });
  }

  try {
    const id = uuidv4 ();
    const query =
      'INSERT INTO clientes (id, nome, email, telefone, codigo, conta_corrente) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
    const values = [id, nome, email, telefone, codigo, contaCorrente];
    const result = await db.query (query, values);
    const row = result.rows[0];
    const cliente = {
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      codigo: row.codigo,
      contaCorrente: row.conta_corrente,
    };
    console.log ('✅ Cliente criado:', id);
    res.status (201).json (cliente);
  } catch (err) {
    console.error ('❌ Erro ao salvar cliente:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao salvar cliente.', detail: err.message});
  }
});

app.put ('/api/clientes/:id', checkDatabase, async (req, res) => {
  const {id} = req.params;
  const {nome, email, telefone, codigo, contaCorrente} = req.body;

  if (!nome || !codigo) {
    return res.status (400).json ({error: 'Nome e Código são obrigatórios.'});
  }

  try {
    const query =
      'UPDATE clientes SET nome = $1, email = $2, telefone = $3, codigo = $4, conta_corrente = $5 WHERE id = $6 RETURNING *';
    const values = [nome, email, telefone, codigo, contaCorrente, id];
    const result = await db.query (query, values);
    if (result.rowCount === 0) {
      return res.status (404).json ({error: 'Cliente não encontrado.'});
    }
    const row = result.rows[0];
    const cliente = {
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      codigo: row.codigo,
      contaCorrente: row.conta_corrente,
    };
    console.log ('✅ Cliente atualizado:', id);
    res.json (cliente);
  } catch (err) {
    console.error ('❌ Erro ao atualizar cliente:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao atualizar cliente.', detail: err.message});
  }
});

app.get ('/api/clientes', checkDatabase, async (req, res) => {
  try {
    console.log ('🔍 Buscando clientes...');
    const result = await db.query (
      'SELECT id, nome, email, telefone, codigo, conta_corrente FROM clientes ORDER BY nome ASC'
    );
    const clientesMapeados = result.rows.map (row => ({
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      codigo: row.codigo,
      contaCorrente: row.conta_corrente,
    }));
    console.log (`✅ ${clientesMapeados.length} clientes encontrados`);
    res.json (clientesMapeados);
  } catch (err) {
    console.error ('❌ Erro ao buscar clientes:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao buscar clientes.', detail: err.message});
  }
});

app.delete ('/api/clientes/:id', checkDatabase, async (req, res) => {
  const {id} = req.params;
  try {
    const result = await db.query ('DELETE FROM clientes WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status (404).json ({error: 'Cliente não encontrado.'});
    }
    console.log ('✅ Cliente deletado:', id);
    res.status (204).send ();
  } catch (err) {
    console.error ('❌ Erro ao deletar cliente:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao deletar cliente.', detail: err.message});
  }
});

// ----------------------------------------------------------------------
// 5. ROTAS CRUD COBRANÇAS
// ----------------------------------------------------------------------

app.get ('/api/cobrancas', checkDatabase, async (req, res) => {
  try {
    console.log ('🔍 Buscando cobranças...');
    const result = await db.query (
      'SELECT id, cliente_id, descricao, valor, vencimento, status, status_remessa, nsa_remessa FROM cobrancas ORDER BY vencimento DESC'
    );
    const cobrancasMapeadas = result.rows.map (row => ({
      id: row.id,
      clienteId: row.cliente_id,
      descricao: row.descricao,
      valor: row.valor,
      vencimento: row.vencimento,
      status: row.status,
      statusRemessa: row.status_remessa,
      nsa_remessa: row.nsa_remessa,
    }));
    console.log (`✅ ${cobrancasMapeadas.length} cobranças encontradas`);
    res.json (cobrancasMapeadas);
  } catch (err) {
    console.error ('❌ Erro ao buscar cobranças:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao buscar cobranças.', detail: err.message});
  }
});

app.post ('/api/cobrancas', checkDatabase, async (req, res) => {
  const {clienteId, descricao, valor, vencimento, status} = req.body;
  if (!clienteId || !descricao || !valor || !vencimento) {
    return res.status (400).json ({error: 'Campos obrigatórios faltando.'});
  }
  try {
    const id = uuidv4 ();
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
    const row = result.rows[0];
    const cobranca = {
      id: row.id,
      clienteId: row.cliente_id,
      descricao: row.descricao,
      valor: row.valor,
      vencimento: row.vencimento,
      status: row.status,
      statusRemessa: row.status_remessa,
      nsa_remessa: row.nsa_remessa,
    };
    console.log ('✅ Cobrança criada:', id);
    res.status (201).json (cobranca);
  } catch (err) {
    console.error ('❌ Erro ao salvar cobrança:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao salvar cobrança.', detail: err.message});
  }
});

app.put ('/api/cobrancas/:id', checkDatabase, async (req, res) => {
  const {id} = req.params;
  const {clienteId, descricao, valor, vencimento, status} = req.body;
  if (!clienteId || !descricao || !valor || !vencimento) {
    return res.status (400).json ({error: 'Campos obrigatórios faltando.'});
  }
  try {
    const query =
      'UPDATE cobrancas SET cliente_id = $1, descricao = $2, valor = $3, vencimento = $4, status = $5 WHERE id = $6 RETURNING *';
    const values = [clienteId, descricao, valor, vencimento, status, id];
    const result = await db.query (query, values);
    if (result.rowCount === 0) {
      return res.status (404).json ({error: 'Cobrança não encontrada.'});
    }
    const row = result.rows[0];
    const cobranca = {
      id: row.id,
      clienteId: row.cliente_id,
      descricao: row.descricao,
      valor: row.valor,
      vencimento: row.vencimento,
      status: row.status,
      statusRemessa: row.status_remessa,
      nsa_remessa: row.nsa_remessa,
    };
    console.log ('✅ Cobrança atualizada:', id);
    res.json (cobranca);
  } catch (err) {
    console.error ('❌ Erro ao atualizar cobrança:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao atualizar cobrança.', detail: err.message});
  }
});

app.delete ('/api/cobrancas/:id', checkDatabase, async (req, res) => {
  const {id} = req.params;
  try {
    const result = await db.query ('DELETE FROM cobrancas WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status (404).json ({error: 'Cobrança não encontrada.'});
    }
    console.log ('✅ Cobrança deletada:', id);
    res.status (204).send ();
  } catch (err) {
    console.error ('❌ Erro ao deletar cobrança:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao deletar cobrança.', detail: err.message});
  }
});

// ----------------------------------------------------------------------
// 6. ROTAS DE CONFIGURAÇÃO
// ----------------------------------------------------------------------

app.get ('/api/config', checkDatabase, async (req, res) => {
  try {
    console.log ('🔍 Buscando configurações...');
    const result = await db.query (
      'SELECT id, ultimo_nsa_sequencial, parte_fixa_nsa FROM configuracoes WHERE id = 1'
    );
    if (result.rows.length === 0) {
      console.log ('⚠️  Configuração não existe, criando...');
      await db.query (
        "INSERT INTO configuracoes (id, ultimo_nsa_sequencial, parte_fixa_nsa) VALUES (1, 0, '04')"
      );
      const retryResult = await db.query (
        'SELECT id, ultimo_nsa_sequencial, parte_fixa_nsa FROM configuracoes WHERE id = 1'
      );
      const row = retryResult.rows[0];
      const config = {
        id: row.id,
        ultimoNsaSequencial: row.ultimo_nsa_sequencial,
        parteFixaNsa: row.parte_fixa_nsa,
      };
      console.log ('✅ Configuração criada');
      return res.json (config);
    }
    const row = result.rows[0];
    const config = {
      id: row.id,
      ultimoNsaSequencial: row.ultimo_nsa_sequencial,
      parteFixaNsa: row.parte_fixa_nsa,
    };
    console.log ('✅ Configuração encontrada');
    res.json (config);
  } catch (err) {
    console.error ('❌ Erro ao buscar config:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao buscar configurações.', detail: err.message});
  }
});

app.put ('/api/config/:id', checkDatabase, async (req, res) => {
  const {id} = req.params;
  const {ultimoNsaSequencial} = req.body;
  if (typeof ultimoNsaSequencial === 'undefined') {
    return res
      .status (400)
      .json ({error: 'O campo ultimoNsaSequencial é obrigatório.'});
  }
  try {
    const query =
      'UPDATE configuracoes SET ultimo_nsa_sequencial = $1 WHERE id = $2 RETURNING *';
    const values = [ultimoNsaSequencial, id];
    const result = await db.query (query, values);
    if (result.rowCount === 0) {
      return res.status (404).json ({error: 'Configuração não encontrada.'});
    }
    const row = result.rows[0];
    const config = {
      id: row.id,
      ultimoNsaSequencial: row.ultimo_nsa_sequencial,
      parteFixaNsa: row.parte_fixa_nsa,
    };
    console.log ('✅ Configuração atualizada');
    res.json (config);
  } catch (err) {
    console.error ('❌ Erro ao atualizar config:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao atualizar config.', detail: err.message});
  }
});

app.post ('/api/marcar-remessa', checkDatabase, async (req, res) => {
  const {idsParaMarcar, nsaDaRemessa} = req.body;
  if (!Array.isArray (idsParaMarcar) || !nsaDaRemessa) {
    return res
      .status (400)
      .json ({error: 'IDs e NSA da remessa são obrigatórios.'});
  }
  try {
    const idList = idsParaMarcar.map (id => `'${id}'`).join (', ');
    const query = `UPDATE cobrancas SET nsa_remessa = $1, status_remessa = 'Processado' WHERE id IN (${idList}) RETURNING id`;
    const values = [nsaDaRemessa];
    const result = await db.query (query, values);
    console.log (`✅ ${result.rowCount} cobranças marcadas`);
    res.json ({
      message: `Marcadas ${result.rowCount} cobranças para o NSA ${nsaDaRemessa}.`,
    });
  } catch (err) {
    console.error ('❌ Erro ao marcar remessa:', err.message);
    res
      .status (500)
      .json ({error: 'Erro ao marcar remessa.', detail: err.message});
  }
});

// ----------------------------------------------------------------------
// 7. HEALTH CHECK
// ----------------------------------------------------------------------

app.get ('/health', (req, res) => {
  res.status (200).json ({
    status: dbConnected ? 'OK' : 'DATABASE_ERROR',
    timestamp: new Date ().toISOString (),
    port: PORT,
    database: dbConnected ? 'Conectado' : 'Desconectado',
  });
});

app.get ('/', (req, res) => {
  res.json ({
    message: '🚀 Servidor API rodando!',
    version: '1.0.0',
    database: dbConnected ? 'Conectado' : 'Desconectado',
    endpoints: {
      clientes: '/api/clientes',
      cobrancas: '/api/cobrancas',
      config: '/api/config',
      health: '/health',
    },
  });
});

// ----------------------------------------------------------------------
// 8. INICIALIZAÇÃO DO SERVIDOR
// ----------------------------------------------------------------------

const server = app
  .listen (PORT, () => {
    console.log (`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log (`📊 Banco: ${dbConnected ? 'Conectado' : 'Desconectado'}`);
    console.log (`🕐 ${new Date ().toLocaleString ('pt-BR')}\n`);
  })
  .on ('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error (`❌ Porta ${PORT} em uso!`);
      console.log (`💡 Use: PORT=3002 node server.js\n`);
      process.exit (1);
    } else {
      console.error ('❌ Erro ao iniciar servidor:', err);
      process.exit (1);
    }
  });

// ----------------------------------------------------------------------
// 9. TRATAMENTO GRACIOSO
// ----------------------------------------------------------------------

process.on ('SIGTERM', () => {
  console.log ('\n⚠️  Encerrando...');
  server.close (() => {
    if (db) db.end (() => process.exit (0));
    else process.exit (0);
  });
});

process.on ('SIGINT', () => {
  console.log ('\n⚠️  Ctrl+C - Encerrando...');
  server.close (() => {
    if (db) db.end (() => process.exit (0));
    else process.exit (0);
  });
});

process.on ('uncaughtException', err => {
  console.error ('❌ ERRO NÃO CAPTURADO:', err.message);
});

process.on ('unhandledRejection', reason => {
  console.error ('❌ PROMISE REJECTION:', reason);
});
