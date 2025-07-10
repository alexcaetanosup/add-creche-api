// Server do App-Creche com json-server e rotas customizadas

const jsonServer = require('json-server');
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// Middleware para habilitar CORS e para o Express entender JSON
app.use(cors());
app.use(express.json()); // <-- Adição 1

const dataDir = process.env.RENDER ? '/data' : './'; // Usa /data na Render, ./ localmente
const dbPath = path.join(dataDir, 'db.json');

// Garante que o diretório e o db.json existam
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(dbPath)) {
    // const exampleDbPath = path.join(__dirname, 'db.example.json');
    const exampleDbPath = path.join(__dirname, '../client', 'db.example.json');
    if (fs.existsSync(exampleDbPath)) {
        fs.copyFileSync(exampleDbPath, dbPath);
    } else {
        fs.writeFileSync(dbPath, JSON.stringify({ clientes: [], cobrancas: [], config: {} }));
    }
}

// ROTA DE TESTE PARA VERIFICAR SE O ROTEAMENTO CUSTOMIZADO ESTÁ FUNCIONANDO
app.get('/api/healthcheck', (req, res) => {
    console.log('Rota /api/healthcheck foi chamada!');
    res.status(200).json({ status: 'ok', message: 'Servidor customizado está no ar!' });
});

// --- ROTA CUSTOMIZADA DE ARQUIVAMENTO --- (Adição 2)
app.post('/api/arquivar-remessa', (req, res) => {
    const { cobrancasParaArquivar, mesAno } = req.body;
    if (!cobrancasParaArquivar || cobrancasParaArquivar.length === 0) {
        return res.status(400).json({ message: 'Nenhuma cobrança para arquivar foi fornecida.' });
    }
    try {
        const nomeArquivoArquivo = `remessa_${mesAno}.json`;
        const caminhoArquivoArquivo = path.join(dataDir, nomeArquivoArquivo);
        let dadosArquivados = { cobrancas: [] };
        if (fs.existsSync(caminhoArquivoArquivo)) {
            dadosArquivados = JSON.parse(fs.readFileSync(caminhoArquivoArquivo, 'utf-8'));
        }
        dadosArquivados.cobrancas.push(...cobrancasParaArquivar);
        fs.writeFileSync(caminhoArquivoArquivo, JSON.stringify(dadosArquivados, null, 2));
        let dbPrincipal = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        const idsParaRemover = new Set(cobrancasParaArquivar.map(c => c.id));
        dbPrincipal.cobrancas = dbPrincipal.cobrancas.filter(c => !idsParaRemover.has(c.id));
        fs.writeFileSync(dbPath, JSON.stringify(dbPrincipal, null, 2));
        console.log(`Arquivadas ${cobrancasParaArquivar.length} cobranças em ${nomeArquivoArquivo}.`);
        res.status(200).json({ message: 'Remessa arquivada com sucesso!' });
    } catch (error) {
        console.error('Erro ao arquivar remessa:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao arquivar a remessa.' });
    }
});
// --- FIM DA ROTA CUSTOMIZADA ---

// O json-server lida com as rotas padrão de CRUD (/api/clientes, /api/cobrancas, etc.)
const router = jsonServer.router(dbPath);
const middlewares = jsonServer.defaults();
app.use(middlewares);
app.use('/api', router); // O json-server deve vir DEPOIS das suas rotas customizadas

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});