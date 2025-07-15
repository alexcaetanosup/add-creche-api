# Sistema de Gestão de Cobranças - App Creche (API Backend)

Este é o backend do Sistema de Gestão de Cobranças. É uma API RESTful construída com **Node.js** e **Express**, utilizando o **Supabase** como banco de dados PostgreSQL para persistência de dados.

## ✨ Funcionalidades da API

- **Endpoints CRUD Completos:** Fornece rotas para Criar, Ler, Atualizar e Deletar (CRUD) `clientes`, `cobrancas` e `config`.
- **Processamento de Arquivos:**
  - **Retorno:** Uma rota para receber o upload de arquivos de retorno do banco, fazer o parse e atualizar o status das cobranças.
  - **Arquivamento:** Uma rota para marcar cobranças como processadas e gerar um backup em JSON no servidor.
  - **Download:** Rotas para listar e baixar os arquivos de backup gerados.
- **Segurança:** Utiliza variáveis de ambiente para armazenar as chaves de conexão com o Supabase.

## 🚀 Tecnologias Utilizadas

- **Node.js:** Ambiente de execução do JavaScript no servidor.
- **Express.js:** Framework para a construção da API.
- **Supabase:** Plataforma que fornece o banco de dados PostgreSQL e as ferramentas de autenticação.
- **Bibliotecas:**
  - `cors`: Para habilitar requisições de outros domínios.
  - `dotenv`: Para carregar variáveis de ambiente em desenvolvimento.
  - `multer`: Para lidar com o upload de arquivos.

## ⚙️ Configuração do Ambiente de Desenvolvimento

Para rodar este projeto localmente, você precisará ter o [Node.js](https://nodejs.org/) (versão 18.x ou superior) instalado.

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/alexcaetanosup/add-creche-api.git
    cd add-creche-api
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo chamado `.env` na raiz do projeto e adicione as seguintes variáveis (substitua pelos valores do seu projeto Supabase):
    ```
    SUPABASE_URL=https://SEU_PROJETO_URL.supabase.co
    SUPABASE_SERVICE_KEY=SUA_CHAVE_SERVICE_ROLE_SECRETA
    ```
    > **Importante:** O arquivo `.env` já está no `.gitignore` e não deve ser enviado para o repositório.

4.  **Configure o Banco de Dados:**
    Acesse seu projeto no Supabase e crie as tabelas `clientes`, `cobrancas` e `config` conforme a estrutura definida para a aplicação. Não se esqueça de configurar as chaves estrangeiras e o auto-incremento.

5.  **Inicie o Servidor:**
    ```bash
    npm start
    ```
    A API estará rodando em `http://localhost:3001`.

## 📦 Deploy

Este projeto está configurado para deploy contínuo na plataforma **Render** como um **Web Service**. As variáveis de ambiente `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` devem ser configuradas no dashboard da Render.

---
*Desenvolvido por Alex Caetano dos Santos.*
