const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const pool = require('./db');

const app = express();

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
        const result = await pool.query('SELECT * FROM usuario WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(401).send('E-mail ou senha incorretos!');
        }

        const usuario = result.rows[0];
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
        res.redirect('pagInicial');

    } catch (err) {
        console.error('Erro ao fazer login:', err);
        res.status(500).send('Erro no servidor.');
    }
});

// Rota de cadastro
app.post('/cadastro', async (req, res) => {
    const { nome, email, senha, profilePic } = req.body;

    try {
        const checkUser = await pool.query('SELECT * FROM usuario WHERE email = $1', [email]);
        if (checkUser.rows.length > 0) {
            return res.status(409).send('Usuário já existe');
        }

        const senhaCriptografada = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO usuario (nome, email, senha, profilePic) VALUES ($1, $2, $3, $4) RETURNING id',
            [nome, email, senhaCriptografada, profilePic]
        );

        req.session.user = { id: result.rows[0].id, email };
        console.log('Usuário registrado:', req.session.user);
        res.redirect('pagInicial');

    } catch (err) {
        console.error('Erro ao cadastrar usuário:', err);
        res.status(500).send('Erro no servidor.');
    }
});

// Rota para atualizar senha
app.post('/atualizarSenha', async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        const result = await pool.query('SELECT * FROM usuario WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Usuário não encontrado.' });
        }

        const senhaCriptografada = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE usuario SET senha = $1 WHERE email = $2', [senhaCriptografada, email]);

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
        await pool.query('UPDATE usuario SET nome = $1, email = $2, senha = $3 WHERE id = $4', 
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

        await pool.query('UPDATE usuario SET profilePic = $1 WHERE id = $2', [imagePath, userId]);
        res.json({ message: 'Imagem atualizada com sucesso!', filename: imagePath });

    } catch (err) {
        console.error('Erro ao atualizar foto de perfil:', err);
        res.status(500).send('Erro no servidor.');
    }
});

app.use('/uploads', express.static('uploads'));

// Rota protegida - Página inicial
app.get('/pagInicial', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/pagInicial.html'));
});

// Rota para buscar dados do usuário
app.get('/getUserData', verificarAutenticacao, async (req, res) => {
    const userId = req.session.user.id;

    try {
        const result = await pool.query('SELECT nome, email, profilePic FROM usuario WHERE id = $1', [userId]);
        res.json(result.rows[0]);

    } catch (err) {
        console.error('Erro ao buscar dados do usuário:', err);
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
