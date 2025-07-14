require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const multer = require('multer'); // Importa o multer para upload de arquivos

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

const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
        fetch: (url, options) => fetch(url, { ...options, ...(process.env.NODE_ENV !== 'production' && { rejectUnauthorized: false }) })
    }
});

// Configuração do multer para salvar o arquivo em memória
const upload = multer({ storage: multer.memoryStorage() });


// =================================================================
// --- ROTAS DA API (DEFINIDAS EXPLICITAMENTE) ---
// =================================================================

// Rota de teste
app.get('/api/healthcheck', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'API está no ar e funcionando!' });
});

// --- ROTAS CUSTOMIZADAS (para arquivos e processos especiais) ---

// Rota para processar o arquivo de retorno
app.post('/api/processar-retorno', upload.single('arquivoRetorno'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
    }

    const conteudoArquivo = req.file.buffer.toString('utf-8');
    const linhas = conteudoArquivo.split(/\r?\n/);

    let processados = 0;
    let pagos = 0;
    let rejeitados = 0;
    let errosDeAtualizacao = 0;

    const promises = linhas.map(async (linha) => {
        if (linha.trim() === '' || !linha.startsWith('T')) {
            return;
        }
        processados++;

        // Lógica de Parse (AJUSTE CONFORME SEU LAYOUT REAL)
        const identificadorCobranca = linha.substring(1, 17).trim();
        const codigoOcorrencia = linha.substring(17, 19).trim();

        let novoStatus = null;
        if (codigoOcorrencia === '00' || codigoOcorrencia === 'PG') {
            novoStatus = 'Pago';
            pagos++;
        } else {
            novoStatus = `Rejeitado (${codigoOcorrencia})`;
            rejeitados++;
        }

        if (novoStatus && identificadorCobranca) {
            // Assume que o 'identificadorCobranca' no arquivo corresponde ao 'id' no banco
            const { error } = await supabase
                .from('cobrancas')
                .update({ status: novoStatus })
                .eq('id', identificadorCobranca);

            if (error) {
                console.error(`Erro ao atualizar cobrança ${identificadorCobranca}:`, error.message);
                errosDeAtualizacao++;
            }
        }
    });

    try {
        await Promise.all(promises);
        res.status(200).json({
            success: true,
            message: 'Arquivo de retorno processado!',
            detalhes: {
                "Total de Transações no Arquivo": processados,
                "Cobranças Pagas": pagos,
                "Cobranças Rejeitadas/Outras": rejeitados,
                "Falhas na Atualização": errosDeAtualizacao,
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ocorreu um erro durante o processamento em lote.' });
    }
});


const dataDir = process.env.RENDER_INSTANCE_ID ? '/data' : './';

app.get('/api/listar-arquivos', (req, res) => {
    try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const files = fs.readdirSync(dataDir).filter(f => f.startsWith('remessa_') && f.endsWith('.json'));
        res.status(200).json(files.sort().reverse());
    } catch (error) {
        res.status(500).json({ message: "Erro ao listar arquivos." });
    }
});

app.get('/api/download-arquivo/:nomeArquivo', (req, res) => {
    const caminhoArquivo = path.join(dataDir, req.params.nomeArquivo);
    if (fs.existsSync(caminhoArquivo)) res.download(caminhoArquivo);
    else res.status(404).json({ message: "Arquivo não encontrado." });
});

app.post('/api/arquivar-remessa', async (req, res) => {
    const { cobrancasParaArquivar, mesAno } = req.body;
    if (!cobrancasParaArquivar || !cobrancasParaArquivar.length) {
        return res.status(400).json({ message: 'Nenhuma cobrança para arquivar.' });
    }
    const nomeArquivo = `remessa_${mesAno}.json`;
    const caminhoArquivo = path.join(dataDir, nomeArquivo);
    try {
        let dadosArquivados = { cobrancas: [] };
        if (fs.existsSync(caminhoArquivo)) {
            dadosArquivados = JSON.parse(fs.readFileSync(caminhoArquivo, 'utf-8'));
        }
        dadosArquivados.cobrancas.push(...cobrancasParaArquivar);
        fs.writeFileSync(caminhoArquivo, JSON.stringify(dadosArquivados, null, 2));
    } catch (error) {
        console.error("Erro ao salvar arquivo de backup:", error);
    }
    try {
        const idsParaRemover = cobrancasParaArquivar.map(c => c.id);
        const { error } = await supabase.from('cobrancas').delete().in('id', idsParaRemover);
        if (error) throw error;
        res.status(200).json({ message: 'Remessa finalizada e cobranças removidas!' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// --- ROTAS DE CRUD PARA SUPABASE ---

app.get('/api/clientes', async (req, res) => {
    const { data, error } = await supabase.from('clientes').select('*').order('nome');
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});
app.post('/api/clientes', async (req, res) => {
    const { data, error } = await supabase.from('clientes').insert(req.body).select();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data[0]);
});
app.put('/api/clientes/:id', async (req, res) => {
    const { data, error } = await supabase.from('clientes').update(req.body).eq('id', req.params.id).select();
    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data[0]);
});
app.delete('/api/clientes/:id', async (req, res) => {
    const { error } = await supabase.from('clientes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
});

app.get('/api/cobrancas', async (req, res) => {
    const { data, error } = await supabase.from('cobrancas').select('*').order('vencimento');
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});
app.post('/api/cobrancas', async (req, res) => {
    const { data, error } = await supabase.from('cobrancas').insert(req.body).select();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data[0]);
});
app.put('/api/cobrancas/:id', async (req, res) => {
    const { data, error } = await supabase.from('cobrancas').update(req.body).eq('id', req.params.id).select();
    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data[0]);
});
app.delete('/api/cobrancas/:id', async (req, res) => {
    const { error } = await supabase.from('cobrancas').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
});

app.get('/api/config', async (req, res) => {
    const { data, error } = await supabase.from('config').select('*').eq('id', 1).single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});
app.put('/api/config/:id', async (req, res) => {
    const { data, error } = await supabase.from('config').update(req.body).eq('id', 1).select();
    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data[0]);
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`API com Supabase rodando na porta ${PORT}`);
});