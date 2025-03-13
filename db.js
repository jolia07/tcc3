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

async function criarTabelas() {
  try {
      await pool.query(`
          CREATE TABLE IF NOT EXISTS materia (
              id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
              uc varchar(255) not null,
              ch int not null
          );
      `);
      console.log("Tabela 'materia' pronta!");

      await pool.query(`
          CREATE TABLE IF NOT EXISTS usuarios (
              id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
              nome VARCHAR(255) NOT NULL,
              email VARCHAR(255) UNIQUE NOT NULL,
              senha VARCHAR(255) NOT NULL,
              telefone VARCHAR(20) NOT NULL,
              profilePic VARCHAR(255),
              tipo ENUM('docente', 'adm', 'aluno') NOT NULL
          );
      `);
      console.log("Tabela 'usuarios' pronta!");

      await pool.query(`
          CREATE TABLE IF NOT EXISTS aula (
              id INT AUTO_INCREMENT PRIMARY KEY NOT NULL,
              turno varchar(255) not null,
              laboratorio VARCHAR(255) NOT NULL,
              turma VARCHAR(255) UNIQUE NOT NULL,
              dataInicio varchar(255) not null,
              diasSemana varchar(255) NOT NULL,
              materia_id int,
              foreign key (materia_id) references materia(id) on delete cascade,
              usuario_id int,
              foreign key (usuario_id) references usuarios(id) on delete cascade
          );
      `);
      console.log("Tabela 'aula' pronta!");

  } catch (err) {
      console.error("Erro ao criar tabelas:", err);
  }
}

// Chamando a função para criar as tabelas
criarTabelas();

// Conectar ao banco e criar a tabela
pool.getConnection()
  .then(() => {
    console.log("Conectado ao MySQL no Railway!");
  })
  .catch(err => console.error("Erro na conexão", err));

async function obterAulas() {
  try {
      const [rows] = await pool.query(`
          SELECT 
                aula.id, 
                aula.turno, 
                aula.laboratorio, 
                aula.turma, 
                aula.dataInicio, 
                aula.diasSemana, 
                materia.uc AS materia, 
                usuarios.nome AS professor
            FROM aula
            JOIN materia ON aula.materia_id = materia.id
            JOIN usuarios ON aula.usuario_id = usuarios.id;
      `);
      return rows;  // Retorna os resultados
    } catch (err) {
      console.error("Erro ao buscar aulas:", err);
      return [];
    }
}

module.exports = pool; // Exporta o pool, NÃO fecha a conexão!