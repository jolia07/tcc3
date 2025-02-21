const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
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
    cb(null, path.join(__dirname, 'public', 'img'));
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
    const [rows] = await pool.query('SELECT * FROM usuario WHERE email = ?', [email]);

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
  const { nome, email, senha, profilePic } = req.body;

  try {
    const [checkUser] = await pool.query('SELECT * FROM usuario WHERE email = ?', [email]);
    if (checkUser.length > 0) {
      return res.status(409).send('Usuário já existe');
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);
    const [result] = await pool.query(
      'INSERT INTO usuario (nome, email, senha, profilePic) VALUES (?, ?, ?, ?)',
      [nome, email, senhaCriptografada, profilePic]
    );

    req.session.user = { id: result.insertId, email };
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
    const [rows] = await pool.query('SELECT * FROM usuario WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.json({ success: false, message: 'Usuário não encontrado.' });
    }

    const senhaCriptografada = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE usuario SET senha = ? WHERE email = ?', [senhaCriptografada, email]);

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
    await pool.query('UPDATE usuario SET nome = ?, email = ?, senha = ? WHERE id = ?', 
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

    await pool.query('UPDATE usuario SET profilePic = ? WHERE id = ?', [imagePath, userId]);
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

// Rota para buscar dados do usuário
app.get('/getUserData', verificarAutenticacao, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const [rows] = await pool.query('SELECT nome, email, profilePic FROM usuario WHERE id = ?', [userId]);
    res.json(rows[0]);

  } catch (err) {
    console.error('Erro ao buscar dados do usuário:', err);
    res.status(500).send('Erro no servidor.');
  }
});

app.post("/materia", async (req, res) => {
  if (!req.session.user) {  // Corrigido de req.session.user_id para req.session.user
    return res.status(401).json({ success: false, message: "Usuário não autenticado" });
}

  const { uc, ch } = req.body;
  const user_id = req.session.user.id; // Obtém o user_id da sessão

  try {
      await pool.query("INSERT INTO materia (uc, ch, user_id) VALUES (?, ?, ?)", [uc, ch, user_id]);
      res.json({ success: true, message: "Matéria cadastrada com sucesso" });
  } catch (error) {
      console.error("Erro ao cadastrar matéria:", error);
      res.status(500).json({ success: false, message: "Erro ao cadastrar matéria" });
  }
});

// Rota para buscar todas as aulas do usuário logado
app.get('/aula', verificarAutenticacao, async (req, res) => {
  const userId = req.session.user.id;

  try {
      const [rows] = await pool.query(`
          SELECT a.id, a.laboratorio, a.turma, a.diasSemana, a.horario, a.materia_id, m.uc AS materia 
          FROM aula a
          JOIN materia m ON a.materia_id = m.id
          WHERE m.user_id = ?
      `, [userId]);

      res.json(rows);
  } catch (err) {
      console.error('Erro ao buscar aulas:', err);
      res.status(500).send('Erro no servidor.');
  }
});

// Rota para adicionar uma aula associada a uma matéria existente
app.post('/aula', verificarAutenticacao, async (req, res) => {
  const { laboratorio, turma, diasSemana, horario, materia_nome } = req.body;
  const userId = req.session.user.id;

  try {
      // Verificar se a matéria existe no banco
      const [materiaRows] = await pool.query('SELECT id FROM materia WHERE uc = ?', [materia_nome]);
      
      if (materiaRows.length === 0) {
          return res.status(400).json({ message: 'Matéria não encontrada' });
      }

      const materia_id = materiaRows[0].id;

      // Inserir a nova aula associada à matéria
      const [result] = await pool.query(
          'INSERT INTO aula (laboratorio, turma, diasSemana, horario, materia_id, user_id) VALUES (?, ?, ?, ?, ?, ?)',
          [laboratorio, turma, diasSemana, horario, materia_id, userId]
      );

      res.status(201).json({ id: result.insertId, message: 'Aula adicionada com sucesso' });
  } catch (err) {
      console.error('Erro ao adicionar aula:', err);
      res.status(500).send('Erro no servidor');
  }
});

// Rota para atualizar uma aula
app.put('/aula/:id', verificarAutenticacao, async (req, res) => {
  const { laboratorio, turma, diasSemana, horario, materia_id } = req.body;
  const aulaId = req.params.id;
  const userId = req.session.user.id;

  try {
      // Verifica se a aula pertence a uma matéria do usuário
      const [aula] = await pool.query(`
          SELECT a.id FROM aula a
          JOIN materia m ON a.materia_id = m.id
          WHERE a.id = ? AND m.user_id = ?
      `, [aulaId, userId]);

      if (aula.length === 0) {
          return res.status(403).send('Acesso negado. Aula não pertence ao usuário.');
      }

      await pool.query(
          'UPDATE aula SET laboratorio = ?, turma = ?, diasSemana = ?, horario = ?, materia_id = ? WHERE id = ?',
          [laboratorio, turma, diasSemana, horario, materia_id, aulaId]
      );

      res.json({ message: 'Aula atualizada com sucesso!' });
  } catch (err) {
      console.error('Erro ao atualizar aula:', err);
      res.status(500).send('Erro no servidor.');
  }
});

// Rota para excluir uma aula
app.delete('/aula/:id', verificarAutenticacao, async (req, res) => {
  const aulaId = req.params.id;
  const userId = req.session.user.id;

  try {
      // Verifica se a aula pertence a uma matéria do usuário antes de excluir
      const [aula] = await pool.query(`
          SELECT a.id FROM aula a
          JOIN materia m ON a.materia_id = m.id
          WHERE a.id = ? AND m.user_id = ?
      `, [aulaId, userId]);

      if (aula.length === 0) {
          return res.status(403).send('Acesso negado. Aula não pertence ao usuário.');
      }

      await pool.query('DELETE FROM aula WHERE id = ?', [aulaId]);
      res.json({ message: 'Aula excluída com sucesso!' });

  } catch (err) {
      console.error('Erro ao excluir aula:', err);
      res.status(500).send('Erro no servidor.');
  }
});


// Rota de logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send('Erro ao encerrar sessão.');
    res.status(200).send('Logout realizado com sucesso!');
  });
});

// Inicializar servidor
app.listen(5505, () => {
  console.log('Servidor rodando na porta 5505');
});