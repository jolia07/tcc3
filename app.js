const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const excelJS = require('exceljs');
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
  const { materia_id, turma, laboratorio, turno, diasSemana, horarios } = req.body;
  
  // Verifique se horarios não está undefined
  console.log(horarios); // Isso deve ser um array de horários ou uma string
  
  if (!horarios || horarios.length === 0) {
      return res.status(400).json({ error: "Horários não selecionados" });
  }

  await pool.query("INSERT INTO aula (materia_id, turma, laboratorio, turno, diasSemana, horarios) VALUES (?, ?, ?, ?, ?, ?)",
      [materia_id, turma, laboratorio, turno, diasSemana.join(', '), horarios.join(', ')]);
  res.json({ message: "Aula cadastrada!" });
});


app.get('/exportar-excel', async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM aula");

  const workbook = new excelJS.Workbook();
  const worksheet = workbook.addWorksheet('Aulas');

  // Definindo os horários para os 24 horas do dia
  const horariosDia = [
    "00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00",
    "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
    "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"
  ];

  // Adicionando cabeçalhos, com a coluna de horários à esquerda
  worksheet.addRow(["Horário", "Matéria", "Turma", "Laboratório", "Turno", "Dias"]);

  // Preenchendo os horários na primeira coluna
  horariosDia.forEach(horario => {
    // Para cada horário, verificamos se existe alguma aula nesse horário
    const aulaNoHorario = rows.filter(row => {
      const horarios = row.horarios.split(', ').map(h => h.trim());
      return horarios.includes(horario);
    });

    // Se houver aula, preenchemos a linha com as informações da aula
    if (aulaNoHorario.length > 0) {
      aulaNoHorario.forEach(aula => {
        worksheet.addRow([horario, aula.materia_id, aula.turma, aula.laboratorio, aula.turno, aula.diasSemana]);
      });
    } else {
      // Caso contrário, apenas preenchemos o horário com uma célula vazia
      worksheet.addRow([horario, "", "", "", "", ""]);
    }
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=Aulas.xlsx');
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