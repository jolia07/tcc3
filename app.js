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
    res.json({ message: "Login bem-sucedido!", redirect: "/perfil.html" });

  } catch (err) {
    console.error('Erro ao fazer login:', err);
    res.status(500).send('Erro no servidor.');
  }
});

// Rota de cadastro
app.post('/cadastro', async (req, res) => {
  const { nome, email, senha, telefone, tipo } = req.body;

  if (!['docente', 'adm', 'aula'].includes(tipo)) {
    return res.status(400).json({ message: "Tipo inválido! Use 'docente', 'adm' ou 'aula'." });
  }

  try {
    const [checkUser] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (checkUser.length > 0) {
      return res.status(409).send('Usuário já existe');
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);
    const [result] = await pool.query(
      'INSERT INTO usuarios (nome, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?)',
      [nome, email, senhaCriptografada, telefone, tipo]
    );

    req.session.user = { id: result.insertId, email, telefone, tipo };
    console.log('Usuário registrado:', req.session.user);
    res.json({ message: "cadastro bem-sucedido!", redirect: "/perfil.html" });

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
  const { nome, email, senha, telefone } = req.body;
  const userId = req.session.user.id;

  try {
    const senhaCriptografada = await bcrypt.hash(senha, 10);
    await pool.query('UPDATE usuarios SET nome = ?, email = ?, senha = ?, telefone =? WHERE id = ?', 
      [nome, email, senhaCriptografada, telefone, userId]);

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


//Redirecionamentos
// Rota protegida - Página principal
app.get('/calendario', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calendario.html'));
});

 // Rota para perfil do usuário
app.get('/perfil', verificarAutenticacao, verificarTipoUsuario(['aluno', 'professor', 'adm']), (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json(req.session.usuario); 
  }
  res.sendFile(path.join(__dirname, 'public', 'perfil.html'));
});

//Rota para a página inicial
app.get('/home', (req, res) => {
  res.sendFile(__dirname + '/public/home.html'); 
});


//Recebendo os usuário ao sistema
function verificarTipoUsuario(tiposPermitidos) {
  return (req, res, next) => {
      if (!req.session || !req.session.usuario) {
          return res.status(401).json({ erro: "Não autorizado" });
      }
      const { tipo } = req.session.usuario;
      if (!tiposPermitidos.includes(tipo)) {
          return res.status(403).json({ erro: "Acesso negado" });
      }
      next();
  };
}

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


//Rotas para calendario.html
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

app.get('/mostrarAulas', async (req, res) => {
  try {
      const aulas = await obterAulas(); // Chama a função que faz a consulta no banco
      res.json(aulas); // Retorna os dados em formato JSON
  } catch (error) {
      res.status(500).json({ error: "Erro ao obter as aulas." });
  }
});

app.get('/exportar-excel', async (req, res) => {
  const [rows] = await pool.query("SELECT a.*, m.uc AS nomeMateria FROM aula a JOIN materia m ON a.materia_id = m.id WHERE a.usuario_id = ?");

  const workbook = new excelJS.Workbook();
  const worksheet = workbook.addWorksheet('Aulas');

  const horariosDia = [
    "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", 
    "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00",
  ];

  // Linha 1 - Cabeçalhos Mesclados e Personalizados
  worksheet.mergeCells('B1:F1'); // Mescla "Dados do Docente/Administrador"
  worksheet.mergeCells('B2:F2'); //Mescla "Docente"
  worksheet.mergeCells('B3:F3'); //Mescla "Email"
  worksheet.mergeCells('B4:F4'); //Mescla "Tel1.:"
  worksheet.mergeCells('B5:F5'); //Mescla "Tel2.:"

  worksheet.mergeCells('T1:T6'); // Mescla COLUNA pras fazer uma divisão
  worksheet.mergeCells('A6:S6'); // Mescla LINHAS pras fazer uma divisão

  worksheet.mergeCells('A9:H9');


  worksheet.getCell('B1').value = "Dados do Docente";
  worksheet.getCell('A9').value = "Janeiro";
  
  worksheet.getCell('B1').alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell('A9').alignment = { horizontal: 'center', vertical: 'middle' };

  const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  meses.forEach((mes, index) => {
    worksheet.getCell(1, index + 8).value = mes;
  });

  // Aplicando cor de fundo para toda a linha 1
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4682B4' } 
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' } 
    };
  });
 

  worksheet.getCell('A2').value = "Docente:";
  worksheet.getCell('A3').value = "E-mail:";
  worksheet.getCell('A4').value = "Tel.1:";
  worksheet.getCell('A5').value = "Tel.2:";

  worksheet.getCell('G2').value = "Dias Úteis:";
  worksheet.getCell('G3').value = "Horas Úteis:";
  worksheet.getCell('G4').value = "Horas Alocadas:";

  ["A1","G1", "T1", "H6", "A2", "A3", "A4", "A5", "G1", "G2", "G3", "G4", "G5"].forEach(cellAddress => {
    const cell = worksheet.getCell(cellAddress);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4682B4' }
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
  });

  ["A9"].forEach(cellAddress => {
    const cell = worksheet.getCell(cellAddress);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3465a4' }
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
  });

  const janeiro = worksheet.addRow(["","Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]);
  janeiro.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4682B4' }
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
  });

  // Cabeçalho da tabela (sem a coluna "Dias")
  const tableHeaderRow = worksheet.addRow(["Horário"]);

  tableHeaderRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4682B4' }
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
  });

  // Preenchendo os horários e dados
  horariosDia.forEach(horario => {
    const aulaNoHorario = rows.filter(row => {
      const horarios = row.horarios.split(', ').map(h => h.trim());
      return horarios.includes(horario);
    });

    if (aulaNoHorario.length > 0) {
      aulaNoHorario.forEach(aula => {
        worksheet.addRow([horario, aula.materia_id, aula.turma, aula.laboratorio, aula.turno]);
      });
    } else {
      worksheet.addRow([horario, "", "", "", ""]);
    }
  });

  // Ajustar automaticamente a largura das colunas
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value ? cell.value.toString() : "";
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = maxLength + 5;
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