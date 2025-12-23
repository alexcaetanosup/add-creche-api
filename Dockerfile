# ----------------------------------------------------
# FASE 1: BUILD (Compilação)
# ----------------------------------------------------
FROM node:18-alpine AS builder 
WORKDIR /usr/src/app
COPY package*.json ./
# Instala todas as dependências (dev e prod)
RUN npm install
COPY . .
# Compila o TypeScript para JavaScript (gera arquivos em 'dist')
RUN npm run build 


# ----------------------------------------------------
# FASE 2: PRODUCTION (Runtime)
# ----------------------------------------------------
FROM node:18-alpine 

WORKDIR /usr/src/app

# Copia apenas as dependências de PRODUÇÃO (node_modules)
COPY --from=builder /usr/src/app/node_modules ./node_modules
# Copia APENAS o código JavaScript COMPILADO
COPY --from=builder /usr/src/app/dist ./dist 
# Copia package.json (necessário para rodar 'npm start' se for o caso)
COPY package*.json ./ 

EXPOSE 3001

# CMD final: Executa o script 'start' que agora aponta para o JS compilado, 
# OU executa o JS compilado diretamente (mais seguro).
# Usando o comando direto evita a necessidade do 'npm start' no Docker:
CMD [ "node", "dist/server.js" ]



# # 1. ESTÁGIO DE CONSTRUÇÃO: Define a imagem base do Node.js
# # Usamos a versão 18-alpine, que é leve e recomendada para produção.
# FROM node:20-alpine as builder


# # 2. COPIA OS ARQUIVOS DE DEPENDÊNCIAS
# # Copia apenas os arquivos package.json e package-lock.json (ou yarn.lock)
# # Isso permite que o Docker utilize o cache de camadas de forma eficiente.
# COPY package*.json ./

# # 3. INSTALA AS DEPENDÊNCIAS
# # Instala as dependências do projeto, incluindo o driver 'pg'
# RUN npm install

# # 4. COPIA O RESTANTE DO CÓDIGO
# # Copia o restante do código da aplicação (incluindo server.js e outros arquivos)
# COPY . .

# # Comando para compilar o TypeScript (assumindo que "tsc" está configurado)
# # Isso gera os arquivos JavaScript na sua pasta de destino (geralmente 'dist' ou 'build')
# # 🚨 Você precisa garantir que este script exista ou usar 'tsc' diretamente
# RUN npm run build

# # 2. Fase de Produção (Runtime)
# # Usa uma imagem mais leve (apenas para rodar o código)
# FROM node:20-alpine

# # Define o diretório de trabalho dentro do contêiner
# WORKDIR /usr/src/app

# # Copia apenas as dependências de PRODUÇÃO
# COPY --from=builder /usr/src/app/node_modules ./node_modules

# # 🚨 COPIA APENAS O CÓDIGO JAVASCRIPT COMPILADO
# # Assumindo que o compilador TS coloca os arquivos JS no diretório 'dist'
# COPY --from=builder /usr/src/app/dist ./dist


# # 5. EXPOR A PORTA
# # Define a porta em que a aplicação Node.js será executada (a mesma no server.js)
# EXPOSE 3001

# # 6. COMANDO DE INICIALIZAÇÃO
# # Comando para iniciar o servidor Node.js
# # CMD [ "npm", "start" ]:

# # 🚨 Comando final: Roda o arquivo JavaScript compilado (.js)
# # Ajuste 'dist/server.js' se o seu arquivo principal for diferente
# CMD [ "node", "dist/server.js" ]

# # Nota sobre npm start:
# # Certifique-se de que o seu 'package.json' tenha um script 'start' definido:
# # "scripts": {
# #   "start": "node server.js"
# # }