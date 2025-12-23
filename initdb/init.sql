-- Script de Inicialização do Banco de Dados PostgreSQL

-- ==========================================================
-- 1. TABELA USUARIOS (Para Acesso e Autenticação da API)
-- ==========================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Armazena o hash da senha
    role VARCHAR(50) NOT NULL DEFAULT 'admin', -- Ex: admin, operador, cliente
    ativo BOOLEAN DEFAULT TRUE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- O Índice na coluna 'email' acelera as consultas de login.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);


-- ==========================================================
-- 2. TABELA PASSWORD_RESET_TOKENS
-- ==========================================================
-- Tabela para gerenciar a funcionalidade de recuperação de senha
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL, -- O token único enviado por email
    expira_em TIMESTAMP WITH TIME ZONE NOT NULL, -- Quando o token deve expirar
    usado BOOLEAN DEFAULT FALSE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 3. TABELA CONFIG (Configurações Gerais)
-- ==========================================================
CREATE TABLE IF NOT EXISTS config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL
);

-- ==========================================================
-- 4. TABELA CLIENTES
-- ==========================================================
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) UNIQUE,
    email VARCHAR(255) UNIQUE,
    telefone VARCHAR(20),
    endereco TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 5. TABELA COBRANCAS (Contas a Receber)
-- ==========================================================
CREATE TABLE IF NOT EXISTS cobrancas (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
    valor NUMERIC(10, 2) NOT NULL,
    data_vencimento DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE',
    descricao TEXT,
    codigo_barras VARCHAR(255),
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================================
-- 6. DADOS INICIAIS (OPCIONAL)
-- ==========================================================

-- Insere um usuário inicial (SENHA DEVE SER HASHADA NA APLICAÇÃO REAL)
-- ATENÇÃO: Substitua 'senha_segura_aqui' pelo HASH real da sua senha.
-- Estou usando 'plain text' aqui apenas para exemplo de inicialização.
INSERT INTO usuarios (nome, email, password_hash, role) VALUES 
('Admin Principal', 'admin@creche.com', 'senha_segura_aqui', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO config (key, value) VALUES 
('ultima_remessa_processada', '2025-07-01')
ON CONFLICT (key) DO NOTHING;