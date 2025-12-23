// server.js

// 1. CARREGAR VARIÁVEIS DE AMBIENTE
require ('dotenv').config ();

// 2. IMPORTAÇÕES PRINCIPAIS
const express = require ('express');
const cors = require ('cors');
const {createClient} = require ('@supabase/supabase-js');
const nodemailer = require ('nodemailer');

// 3. CONFIGURAÇÃO DO BANCO DE DADOS (POSTGRES OU SQLITE)
let db;
const connectionUrl = process.env.DATABASE_URL; // URL do PostgreSQL fornecida pelo Render
const isProduction = process.env.NODE_ENV === 'production';

// Verifica se há uma URL de conexão de produção (PostgreSQL)
if (isProduction && connectionUrl) {
  console.log ('Modo de Produção: Usando PostgreSQL.');
  try {
    const {Client} = require ('pg');
    db = new Client ({
      connectionString: connectionUrl,
      ssl: {
        // Necessário para conexões com alguns serviços de nuvem como Supabase
        rejectUnauthorized: false,
      },
      // ADICIONE ESTA LINHA:
      family: 4, // Força o cliente a usar IPv4
    });
    db.connect (err => {
      if (err) {
        console.error ('ERRO: Falha ao conectar ao PostgreSQL:', err.stack);
        // É CRÍTICO SAIR SE NÃO CONECTAR AO DB
        process.exit (1);
      } else {
        console.log ('Conexão bem-sucedida ao PostgreSQL de produção!');
      }
    });
  } catch (e) {
    console.error ("ERRO: O driver 'pg' não pode ser carregado.", e);
    process.exit (1);
  }
} else {
  // Usar SQLite localmente (Apenas para desenvolvimento local!)
  console.log ('Modo de Desenvolvimento: Usando SQLite.');
  try {
    const sqlite3 = require ('sqlite3').verbose ();
    // O Render ignora este bloco, ele só será executado localmente.
    db = new sqlite3.Database ('database.sqlite', err => {
      if (err) {
        console.error (
          'ERRO CRÍTICO: Não foi possível conectar ao banco de dados SQLite:',
          err.message
        );
        process.exit (1);
      }
    });
  } catch (e) {
    console.error ("ERRO: O driver 'sqlite3' não pode ser carregado.", e);
    process.exit (1);
  }
}

// 4. CONFIGURAÇÃO DA API SUPABASE (Service Role Key para Admin/Backend)
// Estas variáveis são injetadas diretamente pelo Render no ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabaseAdmin;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabaseAdmin = createClient (SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      // Desabilita cache de sessão, pois é um servidor
      persistSession: false,
    },
  });
  console.log ('Cliente Supabase Admin Inicializado.');
} else {
  console.error (
    'ERRO: Variáveis SUPABASE_URL ou SUPABASE_SERVICE_KEY ausentes.'
  );
}

// 5. CONFIGURAÇÃO DO SERVIDOR EXPRESS
const app = express ();
// O Render injeta a porta, mas usamos 3001 como fallback para desenvolvimento.
const PORT = process.env.PORT || 3001;

// Middlewares
app.use (
  cors ({
    // Permite CORS apenas para o seu frontend em produção
    origin: isProduction ? process.env.FRONTEND_URL : 'http://localhost:3000',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  })
);
app.use (express.json ());

// 6. CONFIGURAÇÃO DO EMAIL (Nodemailer)
const transporter = nodemailer.createTransport ({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true', // O Render usa string
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 7. EXEMPLO DE ROTA (Teste de Conexão)
app.get ('/', (req, res) => {
  res.json ({
    message: 'API está rodando!',
    environment: isProduction
      ? 'Production (Postgres)'
      : 'Development (SQLite)',
  });
});

// Exemplo de Rota para redefinição de senha usando Supabase Admin
app.post ('/api/reset-password', async (req, res) => {
  const {email} = req.body;
  if (!supabaseAdmin) {
    return res.status (500).json ({error: 'Configuração do Supabase falhou.'});
  }

  try {
    // Envia o link de redefinição de senha. O Supabase usa a URL configurada
    // no painel (Auth -> URL Configuration) e/ou FRONTEND_URL.
    const {error} = await supabaseAdmin.auth.api.resetPasswordForEmail (email, {
      // Opcional: Especifique a URL de redirecionamento, se necessário
      redirectTo: process.env.FRONTEND_URL + '/reset-password-confirm',
    });

    if (error) throw error;

    res.json ({message: 'Link de redefinição de senha enviado.'});
  } catch (error) {
    console.error ('Erro ao solicitar redefinição de senha:', error.message);
    res.status (500).json ({error: 'Falha ao processar solicitação.'});
  }
});

// 8. INICIAR O SERVIDOR
app.listen (PORT, () => {
  console.log (`🚀 Servidor rodando em http://localhost:${PORT}`);
  // Este log aparecerá no console do Render
});
