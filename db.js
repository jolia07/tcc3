const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'crucially-blessed-ibex.data-1.use1.tembo.io',
  database: 'tcc2',
  password: 'H8NyxvOG6gD0xbBj',
  port: 5432,
  ssl: {
    rejectUnauthorized: false,      // Necessário para conexões seguras no Tembo
  },
});

// Criar tabela se não existir
const createTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aulas (
        id SERIAL PRIMARY KEY,
        turma TEXT NOT NULL,
        dias_semana TEXT NOT NULL,
        laboratorio TEXT NOT NULL,
        unidade_curricular TEXT NOT NULL,
        carga_horaria INTEGER NOT NULL,
        turno TEXT NOT NULL,
        data_inicio DATE NOT NULL,
        data_fim DATE NOT NULL
      );
    `);
    console.log("Tabela 'aulas' pronta!");
  } catch (err) {
    console.error("Erro ao criar a tabela:", err);
  }
};

pool.query(`
  CREATE TABLE IF NOT EXISTS usuario (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      profilePic TEXT
  );
`, (err) => {
  if (err) {
      console.error("Erro ao criar a tabela 'usuario':", err);
  } else {
      console.log("Tabela 'usuario' pronta!");
  }
});

// Conectar ao banco e criar a tabela
pool.connect()
  .then(() => {
    console.log("Conectado ao PostgreSQL no Tembo!");
    createTable();
  })
  .catch(err => console.error("Erro na conexão", err));

module.exports = pool; // Exporta o pool, NÃO fecha a conexão!
