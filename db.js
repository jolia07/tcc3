const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'tcc',
  password: 'jujuBA007.',
  port: 5432,
});

pool.connect()
  .then(() => console.log('Conectado ao PostgreSQL!'))
  .catch(err => console.error('Erro na conexão', err));

module.exports = pool; // Exporta o pool, NÃO fecha a conexão!