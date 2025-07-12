require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// --- CONFIGURAÇÃO INICIAL ---
const app = express();
app.use(cors());
app.use(express.json());

// --- CONEXÃO COM O SUPABASE ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("ERRO CRÍTICO: As variáveis de ambiente do Supabase (SUPABASE_URL, SUPABASE_SERVICE_KEY) não foram definidas. Verifique seu arquivo .env");
    process.exit(1);
}

// Cria o cliente Supabase com a correção para SSL em ambiente de desenvolvimento
const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
        fetch: (url, options) => fetch(url, { ...options, ...(process.env.NODE_ENV !== 'production' && { rejectUnauthorized: false }) })
    }
});


// =================================================================
// --- ROTAS DA API (DEFINIDAS EXPLICITAMENTE) ---
// =================================================================

// Rota de teste para verificar se a API está no ar
app.get('/api/healthcheck', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'API está no ar e funcionando!' });
});

// --- ROTAS DE CLIENTES ---
app.get('/api/clientes', async (req, res) => {
    const { data, error } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
    if (error) {
        console.error('Erro ao buscar clientes:', error);
        return res.status(500).json({ error: error.message });
    }
    res.status(200).json(data);
});

app.post('/api/clientes', async (req, res) => {
    const { data, error } = await supabase.from('clientes').insert(req.body).select();
    if (error) {
        console.error('Erro ao criar cliente:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(201).json(data[0]);
});

app.put('/api/clientes/:id', async (req, res) => {
    const { data, error } = await supabase.from('clientes').update(req.body).eq('id', req.params.id).select();
    if (error) {
        console.error('Erro ao atualizar cliente:', error);
        return res.status(400).json({ error: error.message });
    }
    if (!data || data.length === 0) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.status(200).json(data[0]);
});

app.delete('/api/clientes/:id', async (req, res) => {
    const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
    if (error) {
        console.error('Erro ao deletar cliente:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(204).send();
});

// --- ROTAS DE COBRANÇAS ---
app.get('/api/cobrancas', async (req, res) => {
    const { data, error } = await supabase.from('cobrancas').select('*').order('vencimento', { ascending: false });
    if (error) {
        console.error('Erro ao buscar cobranças:', error);
        return res.status(500).json({ error: error.message });
    }
    res.status(200).json(data);
});

app.post('/api/cobrancas', async (req, res) => {
    const { data, error } = await supabase.from('cobrancas').insert(req.body).select();
    if (error) {
        console.error('Erro ao criar cobrança:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(201).json(data[0]);
});

app.put('/api/cobrancas/:id', async (req, res) => {
    const { data, error } = await supabase.from('cobrancas').update(req.body).eq('id', req.params.id).select();
    if (error) {
        console.error('Erro ao atualizar cobrança:', error);
        return res.status(400).json({ error: error.message });
    }
    if (!data || data.length === 0) return res.status(404).json({ message: 'Cobrança não encontrada' });
    res.status(200).json(data[0]);
});

app.delete('/api/cobrancas/:id', async (req, res) => {
    const { error } = await supabase.from('cobrancas').delete().eq('id', req.params.id);
    if (error) {
        console.error('Erro ao deletar cobrança:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(204).send();
});


// --- ROTA DE CONFIG (TRATAMENTO ESPECIAL) ---
app.get('/api/config', async (req, res) => {
    const { data, error } = await supabase.from('config').select('*').eq('id', 1).single();
    if (error) {
        console.error('Erro ao buscar config:', error);
        return res.status(500).json({ error: error.message });
    }
    res.status(200).json(data);
});

app.put('/api/config/:id', async (req, res) => {
    // Apenas permite atualizar o registro com id=1
    if (String(req.params.id) !== '1') {
        return res.status(403).json({ message: 'Operação não permitida.' });
    }
    const { data, error } = await supabase.from('config').update(req.body).eq('id', 1).select();
    if (error) {
        console.error('Erro ao atualizar config:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(200).json(data[0]);
});


// --- ROTAS DE ARQUIVAMENTO (que usam o sistema de arquivos) ---
const dataDir = process.env.RENDER_INSTANCE_ID ? '/data' : './';

app.get('/api/listar-arquivos', (req, res) => {
    console.log(`[listar-arquivos] Lendo diretório: ${dataDir}`);
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const files = fs.readdirSync(dataDir).filter(f => f.startsWith('remessa_') && f.endsWith('.json'));
        res.status(200).json(files.sort().reverse());
    } catch (error) {
        console.error("[listar-arquivos] Erro:", error);
        res.status(500).json({ message: "Erro ao listar arquivos." });
    }
});

app.get('/api/download-arquivo/:nomeArquivo', (req, res) => {
    const { nomeArquivo } = req.params;
    const caminhoArquivo = path.join(dataDir, nomeArquivo);
    if (fs.existsSync(caminhoArquivo)) {
        res.download(caminhoArquivo);
    } else {
        res.status(404).json({ message: "Arquivo de arquivamento não encontrado." });
    }
});

app.post('/api/arquivar-remessa', async (req, res) => {
    const { cobrancasParaArquivar, mesAno } = req.body;
    if (!cobrancasParaArquivar || cobrancasParaArquivar.length === 0) {
        return res.status(400).json({ message: 'Nenhuma cobrança para arquivar.' });
    }

    // 1. Salva um backup em arquivo JSON
    const nomeArquivo = `remessa_${mesAno}.json`;
    const caminhoArquivo = path.join(dataDir, nomeArquivo);
    try {
        let dadosArquivados = { cobrancas: [] };
        if (fs.existsSync(caminhoArquivo)) {
            dadosArquivados = JSON.parse(fs.readFileSync(caminhoArquivo, 'utf-8'));
        }
        dadosArquivados.cobrancas.push(...cobrancasParaArquivar);
        fs.writeFileSync(caminhoArquivo, JSON.stringify(dadosArquivados, null, 2));
        console.log(`Backup da remessa salvo em ${nomeArquivo}`);
    } catch (error) {
        console.error("Erro ao salvar arquivo de backup da remessa:", error);
        // Não interrompe o fluxo, mas loga o erro. A operação principal é deletar do DB.
    }

    // 2. Deleta as cobranças do banco de dados principal
    try {
        const idsParaRemover = cobrancasParaArquivar.map(c => c.id);
        const { error } = await supabase.from('cobrancas').delete().in('id', idsParaRemover);
        if (error) throw error;
        res.status(200).json({ message: 'Remessa finalizada e cobranças removidas com sucesso!' });
    } catch (error) {
        console.error("[arquivar-remessa] Erro do Supabase ao deletar:", error);
        res.status(500).json({ message: error.message });
    }
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`API com Supabase rodando na porta ${PORT}`);
});