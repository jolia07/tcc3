const mysql = require('mysql2/promise'); // Importa o mysql2

// Configuração da conexão com o MySQL
const pool = mysql.createPool({
  host: 'metro.proxy.rlwy.net',
  user: 'root', // Substitua pelo usuário do MySQL
  database: 'railway',
  password: 'rgqWvFdLQYylJOeBffxARDNTEZvrlIPu', // Substitua pela senha do MySQL
  port: 22537 , // Porta padrão do MySQL
  ssl: {
    rejectUnauthorized: false, // Necessário para conexões seguras no xxx
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.query(`
  CREATE TABLE IF NOT EXISTS materia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uc varchar(255) not null,
    ch int not null,
    user_id int,
    foreign key (user_id) references usuario(id) on delete cascade
  );
`).then(() => {
  console.log("Tabela 'materia' pronta!");
}).catch(err => {
  console.error("Erro ao criar a tabela 'materia':", err);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS usuario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      senha VARCHAR(255) NOT NULL,
      profilePic VARCHAR(255)
  );
`).then(() => {
  console.log("Tabela 'usuario' pronta!");
}).catch(err => {
  console.error("Erro ao criar a tabela 'usuario':", err);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS aula (
      id INT AUTO_INCREMENT PRIMARY KEY,
      laboratorio VARCHAR(255) NOT NULL,
      turma VARCHAR(255) UNIQUE NOT NULL,
      diasSemana varchar(255) NOT NULL,
      horario time,
      materia_id int,
      foreign key (materia_id) references materia(id) on delete cascade
  );
`).then(() => {
  console.log("Tabela 'aula' pronta!");
}).catch(err => {
  console.error("Erro ao criar a tabela 'aula':", err);
});

// Conectar ao banco e criar a tabela
pool.getConnection()
  .then(() => {
    console.log("Conectado ao MySQL no Railway!");
  })
  .catch(err => console.error("Erro na conexão", err));

module.exports = pool; // Exporta o pool, NÃO fecha a conexão!