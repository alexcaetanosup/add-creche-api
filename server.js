const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURAÇÃO INICIAL ---
const app = express();
app.use(cors());
app.use(express.json());

// --- CONEXÃO COM O SUPABASE ---
// As variáveis de ambiente serão configuradas na Render
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Validação para garantir que as variáveis de ambiente foram carregadas
if (!supabaseUrl || !supabaseKey) {
    console.error("ERRO CRÍTICO: As variáveis de ambiente do Supabase (SUPABASE_URL, SUPABASE_SERVICE_KEY) não foram definidas.");
    process.exit(1); // Encerra o processo se as chaves não existirem
}

const supabase = createClient(supabaseUrl, supabaseKey);


// =================================================================
// --- ROTAS DA API ---
// =================================================================

// Rota de teste
app.get('/api/healthcheck', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'API com Supabase está no ar!' });
});


// --- ROTAS DE CLIENTES ---

// GET todos os clientes
app.get('/api/clientes', async (req, res) => {
    const { data, error } = await supabase.from('clientes').select('*').order('nome');
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});

// POST um novo cliente
app.post('/api/clientes', async (req, res) => {
    const { data, error } = await supabase.from('clientes').insert(req.body).select();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data[0]);
});

// PUT (atualizar) um cliente existente
app.put('/api/clientes/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('clientes').update(req.body).eq('id', id).select();
    if (error) return res.status(400).json({ error: error.message });
    if (data.length === 0) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.status(200).json(data[0]);
});

// DELETE um cliente
app.delete('/api/clientes/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send(); // 204 No Content
});


// --- ROTAS DE COBRANÇAS ---

// GET todas as cobranças
app.get('/api/cobrancas', async (req, res) => {
    const { data, error } = await supabase.from('cobrancas').select('*').order('vencimento');
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});

// POST uma nova cobrança
app.post('/api/cobrancas', async (req, res) => {
    const { data, error } = await supabase.from('cobrancas').insert(req.body).select();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data[0]);
});

// PUT (atualizar) uma cobrança existente
app.put('/api/cobrancas/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('cobrancas').update(req.body).eq('id', id).select();
    if (error) return res.status(400).json({ error: error.message });
    if (data.length === 0) return res.status(404).json({ message: 'Cobrança não encontrada' });
    res.status(200).json(data[0]);
});

// DELETE uma cobrança
app.delete('/api/cobrancas/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('cobrancas').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
});


// --- ROTA DE CONFIGURAÇÃO (NSA) ---

// GET a configuração (sempre o registro com id=1)
app.get('/api/config', async (req, res) => {
    const { data, error } = await supabase.from('config').select('*').eq('id', 1).single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});

// PUT (atualizar) a configuração (sempre o registro com id=1)
app.put('/api/config/1', async (req, res) => {
    const { data, error } = await supabase.from('config').update(req.body).eq('id', 1).select();
    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data[0]);
});


// --- ROTA DE ARQUIVAMENTO DE REMESSA ---
// Esta rota é um processo mais complexo (uma "transação")
app.post('/api/arquivar-remessa', async (req, res) => {
    const { cobrancasParaArquivar } = req.body;

    if (!cobrancasParaArquivar || cobrancasParaArquivar.length === 0) {
        return res.status(400).json({ message: 'Nenhuma cobrança para arquivar foi fornecida.' });
    }

    try {
        // 1. Pega os IDs das cobranças para deletar da tabela principal
        const idsParaRemover = cobrancasParaArquivar.map(c => c.id);

        // 2. Cria os registros para inserir na tabela de arquivamento
        // (Assumindo que você criou uma tabela 'cobrancas_arquivadas')
        // Se não criou, esta parte pode ser removida e você pode apenas deletar.
        /*
        const { error: archiveError } = await supabase.from('cobrancas_arquivadas').insert(cobrancasParaArquivar);
        if (archiveError) {
            throw new Error(`Falha ao arquivar: ${archiveError.message}`);
        }
        */

        // 3. Deleta as cobranças da tabela principal
        const { error: deleteError } = await supabase.from('cobrancas').delete().in('id', idsParaRemover);
        if (deleteError) {
            // Em um sistema real, aqui você faria um "rollback" da inserção no arquivo.
            // Para nosso caso, apenas reportamos o erro.
            throw new Error(`Falha ao deletar cobranças originais: ${deleteError.message}`);
        }

        res.status(200).json({ message: 'Remessa finalizada e cobranças removidas com sucesso!' });

    } catch (error) {
        console.error('Erro no processo de arquivamento:', error);
        res.status(500).json({ message: error.message });
    }
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`API com Supabase rodando na porta ${PORT}`);
});