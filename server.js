require ('dotenv').config ();

const express = require ('express');
const cors = require ('cors');
const fs = require ('fs');
const path = require ('path');
const multer = require ('multer');
const sqlite3 = require ('sqlite3').verbose (); // Importa o sqlite3
const {v4: uuidv4} = require ('uuid'); // Para gerar IDs únicos (UUIDs)
const bcrypt = require ('bcryptjs'); // Para hash de senhas
const nodemailer = require ('nodemailer'); // Para envio de e-mails

// --- CONFIGURAÇÃO INICIAL ---
const app = express ();
app.use (cors ());
app.use (express.json ());

// Define o diretório de dados (persistente na Render, local para desenvolvimento)
// O diretório '/data' é persistente na Render, garantindo que o banco de dados não seja perdido.
const dataDir = process.env.RENDER_INSTANCE_ID ? '/data' : './';
const dbPath = path.join (dataDir, 'database.sqlite'); // Caminho para o arquivo do banco de dados SQLite

// --- CONEXÃO COM O BANCO DE DADOS SQLITE ---
// Conecta ao banco de dados. Se o arquivo 'database.sqlite' não existir, ele será criado.
const db = new sqlite3.Database (dbPath, err => {
  if (err) {
    console.error (
      'ERRO CRÍTICO: Não foi possível conectar ao banco de dados SQLite:',
      err.message
    );
    process.exit (1); // Encerra o processo se houver um erro crítico na conexão
  }
  console.log ('Conectado ao banco de dados SQLite.');

  // Cria as tabelas se elas ainda não existirem
  // A ordem de criação pode ser importante devido a chaves estrangeiras.
  db.serialize (() => {
    // Tabela 'clientes'
    db.run (
      `
            CREATE TABLE IF NOT EXISTS clientes (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                email TEXT,
                telefone TEXT
            )
        `,
      err => {
        if (err)
          console.error ("Erro ao criar tabela 'clientes':", err.message);
      }
    );

    // Tabela 'usuarios' (para autenticação)
    // Usamos esta tabela para o sistema de login e redefinição de senha.
    // A senha_hashed armazenará a senha do usuário após ser processada por bcrypt.
    db.run (
      `
            CREATE TABLE IF NOT EXISTS usuarios (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                senha_hashed TEXT NOT NULL,
                nome TEXT, -- Opcional, se quiser associar um nome ao usuário logável
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `,
      err => {
        if (err)
          console.error ("Erro ao criar tabela 'usuarios':", err.message);
      }
    );

    // Tabela 'cobrancas'
    // Adicionada FOREIGN KEY para manter a integridade referencial com a tabela 'clientes'.
    db.run (
      `
            CREATE TABLE IF NOT EXISTS cobrancas (
                id TEXT PRIMARY KEY,
                cliente_id TEXT NOT NULL,
                valor REAL NOT NULL,
                vencimento TEXT NOT NULL, -- Recomendado formato 'YYYY-MM-DD' para datas
                status TEXT NOT NULL DEFAULT 'Pendente',
                nsa_remessa TEXT,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE ON UPDATE CASCADE
            )
        `,
      err => {
        if (err)
          console.error ("Erro ao criar tabela 'cobrancas':", err.message);
      }
    );

    // Tabela 'password_reset_tokens' (para redefinição de senha)
    // Armazena tokens temporários para o processo de "esqueceu a senha".
    db.run (
      `
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id TEXT PRIMARY KEY,           -- Um UUID para o token
                user_id TEXT NOT NULL,         -- ID do usuário que solicitou a redefinição
                token TEXT UNIQUE NOT NULL,    -- O token único enviado por e-mail
                expires_at TEXT NOT NULL,      -- Data/hora de expiração do token (formato YYYY-MM-DD HH:MM:SS)
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `,
      err => {
        if (err)
          console.error (
            "Erro ao criar tabela 'password_reset_tokens':",
            err.message
          );
      }
    );

    // Tabela 'config'
    // Útil para configurações globais da aplicação.
    db.run (
      `
            CREATE TABLE IF NOT EXISTS config (
                id INTEGER PRIMARY KEY,
                some_config_value TEXT -- Exemplo de coluna de configuração
                -- Adicione outras colunas de configuração conforme suas necessidades
            )
        `,
      err => {
        if (err) console.error ("Erro ao criar tabela 'config':", err.message);
      }
    );

    // Insere uma linha padrão na tabela 'config' se ela estiver vazia.
    // Isso garante que sempre haverá um registro de ID 1 para a configuração, evitando erros em operações PUT.
    db.run (
      `
            INSERT OR IGNORE INTO config (id, some_config_value) VALUES (1, 'valor inicial da configuração');
        `,
      err => {
        if (err)
          console.error ('Erro ao inserir configuração inicial:', err.message);
      }
    );

    // --- EXEMPLO: Criar um usuário admin inicial (para testes) ---
    // Você pode remover isso em produção ou ter um processo de registro.
    // Senha inicial: 'admin123' (será hashed)
    bcrypt.hash ('admin123', 10, (hashErr, hashedPassword) => {
      if (hashErr) {
        console.error ('Erro ao hashear senha de admin inicial:', hashErr);
        return;
      }
      db.run (
        `
                INSERT OR IGNORE INTO usuarios (id, email, senha_hashed, nome) VALUES (?, ?, ?, ?)
            `,
        [uuidv4 (), 'admin@example.com', hashedPassword, 'Administrador'],
        insertUserErr => {
          if (insertUserErr)
            console.error (
              'Erro ao inserir usuário admin inicial:',
              insertUserErr.message
            );
          else console.log ('Usuário admin inicial criado ou já existente.');
        }
      );
    });
  });
});

// Configuração do Nodemailer (use variáveis de ambiente para segurança!)
const transporter = nodemailer.createTransport ({
  host: process.env.EMAIL_HOST, // Ex: 'smtp.gmail.com'
  port: process.env.EMAIL_PORT, // Ex: 587 (para TLS) ou 465 (para SSL/Implicit TLS)
  secure: process.env.EMAIL_SECURE === 'true', // true para 465, false para outras portas como 587
  auth: {
    user: process.env.EMAIL_USER, // Seu e-mail de envio
    pass: process.env.EMAIL_PASS, // Sua senha/app password do e-mail
  },
});

// Configuração do multer para upload de arquivos em memória
const upload = multer ({storage: multer.memoryStorage ()});

// =================================================================
// --- ROTAS DA API ---
// =================================================================

// Rota de teste para verificar se a API está no ar
app.get ('/api/healthcheck', (req, res) => {
  res
    .status (200)
    .json ({status: 'ok', message: 'API está no ar e funcionando!'});
});

// --- ROTAS DE AUTENTICAÇÃO E REDEFINIÇÃO DE SENHA ---

// Rota de Login (exemplo básico)
app.post ('/api/login', (req, res) => {
  const {email, senha} = req.body;
  if (!email || !senha) {
    return res
      .status (400)
      .json ({message: 'E-mail e senha são obrigatórios.'});
  }

  db.get (
    'SELECT id, senha_hashed FROM usuarios WHERE email = ?',
    [email],
    async (err, user) => {
      if (err) {
        console.error ('Erro ao buscar usuário para login:', err.message);
        return res.status (500).json ({message: 'Erro interno do servidor.'});
      }
      if (!user) {
        return res.status (401).json ({message: 'E-mail ou senha inválidos.'});
      }

      const match = await bcrypt.compare (senha, user.senha_hashed);
      if (!match) {
        return res.status (401).json ({message: 'E-mail ou senha inválidos.'});
      }

      // TODO: Em um app real, aqui você geraria um JWT (JSON Web Token)
      // e o enviaria de volta ao cliente para autenticação nas próximas requisições.
      res.status (200).json ({message: 'Login bem-sucedido!', userId: user.id});
    }
  );
});

// Rota para solicitar redefinição de senha
app.post ('/api/forgot-password', async (req, res) => {
  const {email} = req.body;
  if (!email) {
    return res.status (400).json ({message: 'E-mail é obrigatório.'});
  }

  db.get (
    'SELECT id FROM usuarios WHERE email = ?',
    [email],
    async (err, user) => {
      if (err) {
        console.error ('Erro ao buscar usuário para redefinição:', err.message);
        return res.status (500).json ({message: 'Erro interno do servidor.'});
      }
      // É uma boa prática de segurança não informar se o e-mail não existe
      if (!user) {
        console.log (
          `Tentativa de redefinição de senha para e-mail não registrado: ${email}`
        );
        return res.status (200).json ({
          message: 'Se o e-mail estiver registrado, um link de redefinição será enviado.',
        });
      }

      const userId = user.id;
      const token = uuidv4 (); // Gera um token único
      // Token expira em 1 hora (3600000 milissegundos)
      const expiresAt = new Date (Date.now () + 3600000).toISOString ();

      // Insere o token no banco de dados
      db.run (
        'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
        [uuidv4 (), userId, token, expiresAt],
        async function (insertErr) {
          if (insertErr) {
            console.error (
              'Erro ao salvar token de redefinição:',
              insertErr.message
            );
            return res
              .status (500)
              .json ({message: 'Erro ao gerar token de redefinição.'});
          }

          // URL para o frontend (ajuste conforme a URL real do seu frontend!)
          // Use a variável de ambiente FRONTEND_URL
          const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

          try {
            await transporter.sendMail ({
              from: process.env.EMAIL_USER, // Seu e-mail de envio configurado no .env
              to: email,
              subject: 'Redefinição de Senha para o seu Aplicativo',
              html: `
                            <p>Olá,</p>
                            <p>Você solicitou uma redefinição de senha para a sua conta.</p>
                            <p>Para redefinir sua senha, clique no link abaixo:</p>
                            <p><a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Redefinir Senha</a></p>
                            <p>Este link é válido por 1 hora. Se você não solicitou esta redefinição, por favor, ignore este e-mail.</p>
                            <br>
                            <p>Atenciosamente,</p>
                            <p>Sua Equipe de Suporte</p>
                        `,
            });
            res.status (200).json ({
              message: 'Se o e-mail estiver registrado, um link de redefinição será enviado.',
            });
          } catch (emailError) {
            console.error ('Erro ao enviar e-mail de redefinição:', emailError);
            // É importante retornar uma mensagem genérica aqui também para não dar pistas a atacantes
            res.status (500).json ({
              message: 'Erro ao enviar e-mail de redefinição. Tente novamente mais tarde.',
            });
          }
        }
      );
    }
  );
});

// Rota para redefinir a senha
app.post ('/api/reset-password', async (req, res) => {
  const {token, newPassword} = req.body;
  if (!token || !newPassword) {
    return res
      .status (400)
      .json ({message: 'Token e nova senha são obrigatórios.'});
  }

  db.get (
    'SELECT user_id, expires_at FROM password_reset_tokens WHERE token = ?',
    [token],
    async (err, resetToken) => {
      if (err) {
        console.error ('Erro ao buscar token de redefinição:', err.message);
        return res.status (500).json ({message: 'Erro interno do servidor.'});
      }
      // Se o token não existe ou já expirou
      if (!resetToken || new Date (resetToken.expires_at) < new Date ()) {
        // Opcional: deletar token expirado/inválido para limpeza do DB
        if (resetToken) {
          db.run ('DELETE FROM password_reset_tokens WHERE token = ?', [token]);
        }
        return res.status (400).json ({
          message: 'Token inválido ou expirado. Por favor, solicite uma nova redefinição.',
        });
      }

      const userId = resetToken.user_id;
      const hashedPassword = await bcrypt.hash (newPassword, 10); // Hash da nova senha

      // Inicia uma transação para garantir que ambas as operações (atualizar senha e deletar token)
      // ocorram com sucesso ou nenhuma delas ocorra (atomicidade).
      db.serialize (() => {
        db.run ('BEGIN TRANSACTION;', beginErr => {
          if (beginErr) {
            console.error ('Erro ao iniciar transação:', beginErr.message);
            return res
              .status (500)
              .json ({message: 'Erro interno do servidor.'});
          }

          db.run (
            'UPDATE usuarios SET senha_hashed = ? WHERE id = ?',
            [hashedPassword, userId],
            function (updateErr) {
              if (updateErr) {
                console.error (
                  'Erro ao atualizar senha do usuário:',
                  updateErr.message
                );
                db.run ('ROLLBACK;'); // Reverte a transação em caso de erro
                return res
                  .status (500)
                  .json ({message: 'Erro ao redefinir senha.'});
              }

              db.run (
                'DELETE FROM password_reset_tokens WHERE token = ?',
                [token],
                function (deleteErr) {
                  if (deleteErr) {
                    console.error (
                      'Erro ao deletar token de redefinição:',
                      deleteErr.message
                    );
                    db.run ('ROLLBACK;'); // Reverte a transação em caso de erro
                    return res
                      .status (500)
                      .json ({message: 'Erro ao redefinir senha.'});
                  }
                  db.run ('COMMIT;', commitErr => {
                    if (commitErr) {
                      console.error (
                        'Erro ao finalizar transação (COMMIT):',
                        commitErr.message
                      );
                      return res
                        .status (500)
                        .json ({message: 'Erro interno do servidor.'});
                    }
                    res
                      .status (200)
                      .json ({message: 'Senha redefinida com sucesso!'});
                  });
                }
              );
            }
          );
        });
      });
    }
  );
});

// --- ROTAS CUSTOMIZADAS (PROCESSOS ESPECIAIS) ---

// Rota para marcar múltiplas cobranças com um NSA de remessa
app.post ('/api/marcar-remessa', (req, res) => {
  const {idsParaMarcar, nsaDaRemessa} = req.body;
  if (!idsParaMarcar || idsParaMarcar.length === 0 || !nsaDaRemessa) {
    return res.status (400).json ({
      message: 'IDs das cobranças e o NSA da remessa são obrigatórios.',
    });
  }

  // Cria uma string de placeholders para a cláusula IN, ex: '?, ?, ?'
  const placeholders = idsParaMarcar.map (() => '?').join (',');

  db.run (
    `UPDATE cobrancas SET nsa_remessa = ? WHERE id IN (${placeholders})`,
    [nsaDaRemessa, ...idsParaMarcar], // O primeiro '?' é para nsaDaRemessa, os demais para os IDs
    function (err) {
      if (err) {
        console.error ('[marcar-remessa] Erro do SQLite:', err.message);
        return res
          .status (500)
          .json ({message: `Erro ao marcar remessa: ${err.message}`});
      }
      // `this.changes` indica o número de linhas afetadas pela UPDATE
      res.status (200).json ({
        message: `Cobranças marcadas com sucesso com o NSA ${nsaDaRemessa}. Total: ${this.changes} atualizadas.`,
      });
    }
  );
});

// Rota para processar um arquivo de retorno (por exemplo, de banco)
app.post (
  '/api/processar-retorno',
  upload.single ('arquivoRetorno'),
  async (req, res) => {
    if (!req.file) {
      return res
        .status (400)
        .json ({success: false, message: 'Nenhum arquivo enviado.'});
    }

    const conteudoArquivo = req.file.buffer.toString ('utf-8');
    const linhas = conteudoArquivo.split (/\r?\n/); // Divide o arquivo em linhas, tratando diferentes quebras de linha
    let processados = 0, pagos = 0, rejeitados = 0, errosDeAtualizacao = 0;

    // Usar Promise.all para processar as atualizações de forma concorrente
    const promises = linhas.map (linha => {
      return new Promise (resolve => {
        // Ignora linhas vazias ou que não começam com 'T' (exemplo de lógica para arquivo de retorno)
        if (linha.trim () === '' || !linha.startsWith ('T')) {
          return resolve ();
        }

        processados++;
        // Ajuste os índices substring conforme a estrutura real do seu arquivo de retorno
        const identificadorCobranca = linha.substring (1, 17).trim (); // Exemplo: 16 caracteres após o 'T'
        const codigoOcorrencia = linha.substring (17, 19).trim (); // Exemplo: 2 caracteres após o identificador

        let novoStatus = '';
        if (codigoOcorrencia === '00' || codigoOcorrencia === 'PG') {
          // Códigos de sucesso/pago
          novoStatus = 'Pago';
          pagos++;
        } else {
          novoStatus = `Rejeitado (${codigoOcorrencia})`; // Outros códigos indicam rejeição
          rejeitados++;
        }

        if (novoStatus && identificadorCobranca) {
          db.run (
            `UPDATE cobrancas SET status = ? WHERE id = ?`,
            [novoStatus, identificadorCobranca],
            function (err) {
              if (err) {
                console.error (
                  `Erro ao atualizar cobrança ${identificadorCobranca}:`,
                  err.message
                );
                errosDeAtualizacao++;
              }
              resolve (); // Resolve a promise mesmo com erro para não travar o Promise.all
            }
          );
        } else {
          resolve (); // Resolve se a linha não for válida ou faltarem dados essenciais
        }
      });
    });

    try {
      await Promise.all (promises); // Aguarda todas as promessas de atualização serem concluídas
      res.status (200).json ({
        success: true,
        message: 'Arquivo de retorno processado!',
        detalhes: {
          'Transações no Arquivo': processados,
          Pagas: pagos,
          Rejeitadas: rejeitados,
          'Falhas de Atualização': errosDeAtualizacao,
        },
      });
    } catch (e) {
      console.error ('Erro geral no processamento do arquivo de retorno:', e);
      res.status (500).json ({
        success: false,
        message: 'Erro durante o processamento em lote do arquivo de retorno.',
      });
    }
  }
);

// Rota para listar arquivos de remessa salvos no servidor
app.get ('/api/listar-arquivos', (req, res) => {
  try {
    // Garante que o diretório de dados exista antes de tentar ler
    if (!fs.existsSync (dataDir)) {
      fs.mkdirSync (dataDir, {recursive: true});
    }
    // Filtra apenas arquivos que começam com 'remessa_' e terminam com '.json'
    const files = fs
      .readdirSync (dataDir)
      .filter (f => f.startsWith ('remessa_') && f.endsWith ('.json'));
    res.status (200).json (files.sort ().reverse ()); // Retorna os arquivos em ordem decrescente
  } catch (error) {
    console.error ('Erro ao listar arquivos:', error);
    res.status (500).json ({message: 'Erro ao listar arquivos.'});
  }
});

// Rota para baixar um arquivo específico
app.get ('/api/download-arquivo/:nomeArquivo', (req, res) => {
  const caminhoArquivo = path.join (dataDir, req.params.nomeArquivo);
  if (fs.existsSync (caminhoArquivo)) {
    // Envia o arquivo para download
    res.download (caminhoArquivo, err => {
      if (err) {
        console.error ('Erro ao baixar arquivo:', err);
        // Se o erro for 'Headers already sent', pode ser um problema de stream ou cliente.
        // Outros erros devem ser tratados.
        if (!res.headersSent) {
          // Verifica se os headers já foram enviados antes de tentar enviar uma nova resposta
          res.status (500).json ({message: 'Erro ao baixar arquivo.'});
        }
      }
    });
  } else {
    res.status (404).json ({message: 'Arquivo não encontrado.'});
  }
});

// --- ROTAS DE CRUD PADRÃO ---

// CLIENTES
// Buscar todos os clientes
app.get ('/api/clientes', (req, res) => {
  db.all ('SELECT * FROM clientes ORDER BY nome', [], (err, rows) => {
    if (err) return res.status (500).json ({error: err.message});
    res.status (200).json (rows);
  });
});

// Adicionar um novo cliente
app.post ('/api/clientes', (req, res) => {
  // É recomendado que o ID seja gerado no frontend ou que seja um UUID no backend.
  // Se você não enviar o ID no body, e quiser auto-incremento, use INTEGER PRIMARY KEY no schema.
  const {id, nome, email, telefone} = req.body;
  if (!id || !nome) {
    // Validação básica para campos obrigatórios
    return res
      .status (400)
      .json ({error: 'ID e nome do cliente são obrigatórios.'});
  }

  db.run (
    `INSERT INTO clientes (id, nome, email, telefone) VALUES (?, ?, ?, ?)`,
    [id, nome, email, telefone],
    function (err) {
      if (err) {
        // Erros comuns: UNIQUE constraint failed (ID duplicado), NOT NULL constraint failed.
        return res
          .status (400)
          .json ({error: `Erro ao inserir cliente: ${err.message}`});
      }
      res.status (201).json ({id: id, ...req.body}); // Retorna o ID que foi fornecido/gerado
    }
  );
});

// Atualizar um cliente existente
app.put ('/api/clientes/:id', (req, res) => {
  const {nome, email, telefone} = req.body;
  if (!nome) {
    // Validação básica
    return res
      .status (400)
      .json ({error: 'Nome do cliente é obrigatório para atualização.'});
  }

  db.run (
    `UPDATE clientes SET nome = ?, email = ?, telefone = ? WHERE id = ?`,
    [nome, email, telefone, req.params.id],
    function (err) {
      if (err) return res.status (400).json ({error: err.message});
      if (this.changes === 0)
        return res.status (404).json ({message: 'Cliente não encontrado.'});
      res.status (200).json ({id: req.params.id, ...req.body});
    }
  );
});

// Deletar um cliente
app.delete ('/api/clientes/:id', (req, res) => {
  db.run (`DELETE FROM clientes WHERE id = ?`, req.params.id, function (err) {
    if (err) return res.status (400).json ({error: err.message});
    if (this.changes === 0)
      return res.status (404).json ({message: 'Cliente não encontrado.'});
    res.status (204).send (); // 204 No Content para deleções bem-sucedidas
  });
});

// COBRANÇAS
// Buscar todas as cobranças
app.get ('/api/cobrancas', (req, res) => {
  db.all ('SELECT * FROM cobrancas ORDER BY vencimento', [], (err, rows) => {
    if (err) return res.status (500).json ({error: err.message});
    res.status (200).json (rows);
  });
});

// Adicionar uma nova cobrança
app.post ('/api/cobrancas', (req, res) => {
  const {id, cliente_id, valor, vencimento, status, nsa_remessa} = req.body;
  if (!id || !cliente_id || !valor || !vencimento) {
    // Validação básica
    return res.status (400).json ({
      error: 'ID, cliente_id, valor e vencimento da cobrança são obrigatórios.',
    });
  }
  // Define 'Pendente' como status padrão se não for fornecido
  const finalStatus = status || 'Pendente';

  db.run (
    `INSERT INTO cobrancas (id, cliente_id, valor, vencimento, status, nsa_remessa) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, cliente_id, valor, vencimento, finalStatus, nsa_remessa],
    function (err) {
      if (err) return res.status (400).json ({error: err.message});
      res.status (201).json ({id: id, ...req.body});
    }
  );
});

// Atualizar uma cobrança existente
app.put ('/api/cobrancas/:id', (req, res) => {
  const {cliente_id, valor, vencimento, status, nsa_remessa} = req.body;
  // Validação de campos essenciais para a atualização
  if (!cliente_id || !valor || !vencimento) {
    return res.status (400).json ({
      error: 'cliente_id, valor e vencimento da cobrança são obrigatórios para atualização.',
    });
  }

  db.run (
    `UPDATE cobrancas SET cliente_id = ?, valor = ?, vencimento = ?, status = ?, nsa_remessa = ? WHERE id = ?`,
    [cliente_id, valor, vencimento, status, nsa_remessa, req.params.id],
    function (err) {
      if (err) return res.status (400).json ({error: err.message});
      if (this.changes === 0)
        return res.status (404).json ({message: 'Cobrança não encontrada.'});
      res.status (200).json ({id: req.params.id, ...req.body});
    }
  );
});

// Deletar uma cobrança
app.delete ('/api/cobrancas/:id', (req, res) => {
  db.run (`DELETE FROM cobrancas WHERE id = ?`, req.params.id, function (err) {
    if (err) return res.status (400).json ({error: err.message});
    if (this.changes === 0)
      return res.status (404).json ({message: 'Cobrança não encontrada.'});
    res.status (204).send ();
  });
});

// CONFIG
// Buscar a configuração (assume-se que sempre há um único registro com ID 1)
app.get ('/api/config', (req, res) => {
  db.get ('SELECT * FROM config WHERE id = 1', [], (err, row) => {
    if (err) return res.status (500).json ({error: err.message});
    res.status (200).json (row || {}); // Retorna o objeto de configuração ou um objeto vazio se não encontrado
  });
});

// Atualizar a configuração (assume-se que sempre é o registro com ID 1)
app.put ('/api/config/:id', (req, res) => {
  // Força que a atualização seja sempre para a configuração de ID 1
  if (req.params.id !== '1') {
    return res
      .status (400)
      .json ({message: 'Apenas a configuração com ID 1 pode ser atualizada.'});
  }
  const {some_config_value} = req.body; // Adapte para as suas colunas de configuração reais

  db.run (
    `UPDATE config SET some_config_value = ? WHERE id = 1`,
    [some_config_value],
    function (err) {
      if (err) return res.status (400).json ({error: err.message});
      if (this.changes === 0) {
        // Se a linha com ID 1 não existia (o que é improvável devido ao INSERT OR IGNORE na inicialização),
        // poderia-se optar por inseri-la aqui.
        return res.status (404).json ({
          message: 'Configuração padrão (ID 1) não encontrada para atualização.',
        });
      }
      res.status (200).json ({id: 1, ...req.body});
    }
  );
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3001;
app.listen (PORT, () => {
  console.log (`API com SQLite rodando na porta ${PORT}`);
});
