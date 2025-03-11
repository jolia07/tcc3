const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const excelJS = require('exceljs');
const moment = require('moment');
const mysql = require('mysql2/promise'); // Usando mysql2
const app = express();

// Configuração do pool de conexões MySQL
const pool = mysql.createPool({
  host: 'metro.proxy.rlwy.net',
  user: 'root', // Substitua pelo usuário do MySQL
  database: 'railway',
  password: 'rgqWvFdLQYylJOeBffxARDNTEZvrlIPu', // Substitua pela senha do MySQL
  port: 22537 , // Porta padrão do MySQL
  ssl: {
    rejectUnauthorized: false, // Necessário para conexões seguras no Tembo
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(express.json());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));
app.use('/img', express.static(path.join(__dirname, 'img')));

// Configuração da sessão
app.use(session({
  secret: 'seuSegredoAqui',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'img'));
  },
  filename: (req, file, cb) => {
    const userId = req.session.user.id;
    const ext = path.extname(file.originalname);
    cb(null, `profile_${userId}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Apenas imagens são permitidas!'));
  }
});

// Middleware de autenticação
function verificarAutenticacao(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/');
  }
}

// Rota inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

// Rota de login
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).send('E-mail ou senha incorretos!');
    }

    const usuario = rows[0];
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
      return res.status(401).send('E-mail ou senha incorretos!');
    }

    req.session.user = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email
    };

    console.log('Usuário logado:', req.session.user);
    res.redirect('perfil');

  } catch (err) {
    console.error('Erro ao fazer login:', err);
    res.status(500).send('Erro no servidor.');
  }
});

// Rota de cadastro
app.post('/cadastro', async (req, res) => {
  const { nome, email, senha, tipo } = req.body;

  if (!['docente', 'adm'].includes(tipo)) {
    return res.status(400).json({ message: "Tipo inválido! Use 'docente' ou 'adm'." });
  }

  try {
    const [checkUser] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (checkUser.length > 0) {
      return res.status(409).send('Usuário já existe');
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);
    const [result] = await pool.query(
      'INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?, ?, ?, ?)',
      [nome, email, senhaCriptografada, tipo]
    );

    req.session.user = { id: result.insertId, email, tipo };
    console.log('Usuário registrado:', req.session.user);
    res.redirect('perfil');

  } catch (err) {
    console.error('Erro ao cadastrar usuário:', err);
    res.status(500).send('Erro no servidor.');
  }
});

// Rota para atualizar senha
app.post('/atualizarSenha', async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.json({ success: false, message: 'Usuário não encontrado.' });
    }

    const senhaCriptografada = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE usuarios SET senha = ? WHERE email = ?', [senhaCriptografada, email]);

    res.json({ success: true, message: 'Senha atualizada com sucesso!' });

  } catch (err) {
    console.error('Erro ao atualizar senha:', err);
    res.status(500).send('Erro no servidor.');
  }
});

// Rota para atualizar perfil
app.post('/atualizarPerfil', verificarAutenticacao, async (req, res) => {
  const { nome, email, senha } = req.body;
  const userId = req.session.user.id;

  try {
    const senhaCriptografada = await bcrypt.hash(senha, 10);
    await pool.query('UPDATE usuarios SET nome = ?, email = ?, senha = ? WHERE id = ?', 
      [nome, email, senhaCriptografada, userId]);

    res.json({ message: 'Perfil atualizado com sucesso!' });

  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).send('Erro no servidor.');
  }
});

// Rota para upload de imagem de perfil
app.post('/upload-profile-image', verificarAutenticacao, upload.single('profilePic'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhum arquivo foi enviado' });
  }

  try {
    const userId = req.session.user.id;
    const imagePath = req.file.filename;

    await pool.query('UPDATE usuarios SET profilePic = ? WHERE id = ?', [imagePath, userId]);
    res.json({ message: 'Imagem atualizada com sucesso!', filename: imagePath });

  } catch (err) {
    console.error('Erro ao atualizar foto de perfil:', err);
    res.status(500).send('Erro no servidor.');
  }
});

app.use('/uploads', express.static('uploads'));

// Rota protegida - Página inicial
app.get('/calendario', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calendario.html'));
});

 // Rota para perfil do usuário
 app.get('/perfil', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'perfil.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(__dirname + '/public/home.html'); // Substitua pelo caminho correto
});

// Rota para buscar dados do usuário
app.get('/getUserData', verificarAutenticacao, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [rows] = await pool.query('SELECT nome, email, telefone, profilePic, tipo FROM usuarios WHERE id = ?', [userId]);
    res.json(rows[0]);

  } catch (err) {
    console.error('Erro ao buscar dados do usuário:', err);
    res.status(500).send('Erro no servidor.');
  }
});

// Rota para cadastrar matéria
app.post('/materias', async (req, res) => {
  const { uc, ch } = req.body;
  await pool.query("INSERT INTO materia (uc, ch) VALUES (?, ?)", [uc, ch]);
  res.json({ message: "Matéria cadastrada com sucesso!" });
});

// Rota para buscar matérias
app.get('/materias', async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM materia");
  res.json(rows);
});

// Rota para cadastrar aulas
app.post('/aulas', async (req, res) => {
  const { materia_id, turma, laboratorio, turno, diasSemana, dataInicio } = req.body;
  await pool.query("INSERT INTO aula (materia_id, turma, laboratorio, turno, diasSemana, dataInicio) VALUES (?, ?, ?, ?, ?, ?)", 
      [materia_id, turma, laboratorio, turno, diasSemana.join(', '), dataInicio]);
  res.json({ message: "Aula cadastrada!" });
});

app.get('/exportar-excel', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT a.*, m.uc AS nomeMateria
    FROM aula a
    JOIN materia m ON a.materia_id = m.id
`);
  
  const workbook = new excelJS.Workbook();
  const worksheet = workbook.addWorksheet('Horários de Aulas');

  // Cabeçalho da planilha
  const diasSemana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
  const horariosPadrao = ["08:00", "09:00", "10:00", "11:00", "12:00", 
                          "13:00", "14:00", "15:00", "16:00", "17:00", 
                          "18:00", "19:00", "20:00", "21:00"];

  let currentMonth = null;  // Variável para armazenar o mês atual

  // Preencher os horários para cada aula cadastrada
  rows.forEach(async row => {
      const dataInicio = moment(row.dataInicio);  // Data de início da aula
      const mesAno = dataInicio.format('MMMM YYYY');

      // Verifica se o mês é diferente do anterior, para não adicionar o título do mês novamente
      if (mesAno !== currentMonth) {
          worksheet.addRow([`Mês: ${mesAno}`, ...diasSemana]);  // Adiciona título do mês
          currentMonth = mesAno;  // Atualiza o mês atual
      }

      // Criar calendário para o mês
      let dataAtual = moment(dataInicio);  // Início do mês da dataInicio
      const semanas = [];

      // Criando as semanas para o mês
      for (let semana = 1; semana <= 5; semana++) {
          let semanaAtual = [];
          diasSemana.forEach(dia => {
              if (dataAtual.month() === dataInicio.month()) {
                  semanaAtual.push(dataAtual.format('DD/MM'));  // Exemplo: 01/08, 02/08, ...
              } else {
                  semanaAtual.push('');  // Deixe em branco após o final do mês
              }
              dataAtual.add(1, 'days');  // Avança para o próximo dia
          });
          semanas.push(semanaAtual);  // Adiciona a semana ao calendário
      }

      // Adicionando as semanas à planilha
      semanas.forEach(semana => {
          worksheet.addRow([`Semana`, ...semana]);
      });

      // Adicionar horários
      horariosPadrao.forEach(horario => {
          let row = [horario];
          diasSemana.forEach(dia => {
              row.push(''); 
          });
          worksheet.addRow(row);  // Adiciona os horários
      });

      // Preencher os horários conforme os dados cadastrados
      const dias = row.diasSemana ? row.diasSemana.split(', ').map(d => d.trim()) : [];
      let horarios = [];

      // Definir os horários com base no turno
      if (row.turno === "Matutino") horarios = ["08:00", "09:00", "10:00", "11:00", "12:00"];
      else if (row.turno === "Vespertino") horarios = ["13:00", "14:00", "15:00", "16:00", "17:00"];
      else if (row.turno === "Noturno") horarios = ["18:00", "19:00", "20:00", "21:00"];

      const nomeMateria = row.nomeMateria;  // Nome da matéria obtido diretamente do JOIN

      // Alocar a matéria nos horários e dias correspondentes
      horarios.forEach(horario => {
          dias.forEach(dia => {
              // Mapeamento de dias da semana para números de colunas (1 = "Segunda", 2 = "Terça", etc)
              const colIndex = diasSemana.indexOf(dia) + 2;  // Começa em 2 para a coluna B
              worksheet.eachRow({ includeEmpty: true }, (cell, rowIndex) => {
                  // Encontrar a célula correspondente ao dia e horário
                  if (worksheet.getRow(rowIndex).getCell(1).value === horario) {
                      worksheet.getRow(rowIndex).getCell(colIndex).value = nomeMateria; // Preenche com o nome da matéria
                  }
              });
          });
      });
  });

  // Configurar cabeçalho do arquivo Excel
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=Horario_Aulas.xlsx');

  // Escrever e enviar o arquivo
  await workbook.xlsx.write(res);
  res.end();
});


// Rota de logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
      if (err) return res.status(500).send('Erro ao encerrar sessão.');
      res.clearCookie('connect.sid'); // Limpa o cookie de sessão
      res.redirect('/'); // Redireciona para a página inicial
  });
});

// Inicializar servidor
app.listen(5505, () => {
  console.log('Servidor rodando na porta 5505');
});