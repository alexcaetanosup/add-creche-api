// Arquivo: ormconfig.ts

import { ConnectionOptions } from 'typeorm';

const config: ConnectionOptions[] = [
  {
    name: 'default',
    type: 'postgres',
    // Agora sim, o TypeORM entende a leitura da variável de ambiente!
    url: process.env.DATABASE_URL, 
    synchronize: false,
    logging: true,
    entities: [
      './src/models/*.ts', // Use .ts para rodar migrations localmente
      './dist/models/*.js' // Use .js para produção (deploy no Render)
    ],
    migrations: [
      './src/database/migrations/*.ts', // Use .ts para rodar migrations localmente
      './dist/database/migrations/*.js' // Use .js para produção
    ],
    cli: {
      migrationsDir: 'src/database/migrations',
    },
    // Configuração necessária para o Render (PostgreSQL com SSL)
    extra: {
      ssl: {
        rejectUnauthorized: false,
      },
    },
  },
];

export default config;