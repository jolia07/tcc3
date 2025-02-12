const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./db');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
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
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Apenas imagens são permitidas!'));
    }
});

// middleware para verificar autenticação em rotas protegidas
function verificarAutenticacao(req, res, next) {
    if (req.session.user) {
        next(); // usuário autenticado, segue para a rota
    } else {
        res.redirect('/'); // redireciona para a página inicial se não estiver autenticado
    }
}

// rota inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/home.html'));
});

// rota de login
app.post('/login', (req, res) => {
    const { email, senha } = req.body;

    const query = 'SELECT * FROM usuario WHERE email = ? AND senha = ?';
    connection.query(query, [email, senha], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            req.session.user = { 
                id: 
                 results[0].id,nome:
                 results[0].nome, senha: 
                 results[0].senha, email:
                 results[0].email };
            console.log('Usuário logado:', req.session.user);
            return res.redirect('/pagInicial');
        } else {
            res.status(401).send('E-mail ou senha incorretos!');
        }
    });
});

// rota de cadastro
app.post('/cadastro', (req, res) => {
    const { nome, email, senha, profilePic } = req.body;

    const checkUserQuery = 'SELECT * FROM usuario WHERE email = ?';
    connection.query(checkUserQuery, [email], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            return res.status(409).send('Usuário já existe');
        }

        const insertUserQuery = 'INSERT INTO usuario (nome, email, senha, profilePic) VALUES (?, ?, ?, ?)';
        connection.query(insertUserQuery, [nome, email, senha, profilePic], (err, results) => {
            if (err) throw err;

            req.session.user = { id: results.insertId, email };
            console.log('Usuário registrado:', req.session.user);
            res.redirect('/pagInicial');
        });
    });
});

// Rota para atualizar a senha do usuário
app.post('/atualizarSenha', (req, res) => {
    const { email, newPassword } = req.body;

    // Usando Promises em vez de await
    connection.query('SELECT * FROM usuario WHERE email = ?', [email], (error, results) => {
        if (error) {
            console.error(error);
            return res.json({ success: false, message: 'Erro ao verificar o usuário.' });
        }

        if (results.length > 0) {
            // Atualizar a senha no banco de dados
            connection.query('UPDATE usuario SET senha = ? WHERE email = ?', [newPassword, email], (error, results) => {
                if (error) {
                    console.error(error);
                    return res.json({ success: false, message: 'Erro ao atualizar a senha.' });
                }

                res.json({ success: true });
            });
        } else {
            res.json({ success: false, message: 'Usuário não encontrado.' });
        }
    });
});

//rota para atulizar o perfil do usuário
app.post('/atualizarPerfil', verificarAutenticacao, (req, res) => {
    const { nome, email, senha } = req.body;
    const userId = req.session.user.id;

    // atualiza os dados no banco de dados
    const query = 'UPDATE usuario SET nome = ?, email = ?, senha = ? WHERE id = ?';
    connection.query(query, [nome, email, senha, userId], (err) => {
        if (err) {
            console.error('Erro ao atualizar perfil:', err);
            return res.status(500).json({ message: 'Erro ao atualizar perfil' });
        }
        res.json({ message: 'Perfil atualizado com sucesso!' });
    });
});

//atualizar imagem
app.post('/upload-profile-image', verificarAutenticacao, upload.single('profilePic'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhum arquivo foi enviado' });
    }

    try {
        const userId = req.session.user.id;
        const imagePath = req.file.filename;

        const query = 'UPDATE usuario SET profilePic = ? WHERE id = ?';
        connection.query(query, [imagePath, userId], (err) => {
            if (err) {
                console.error('Erro ao atualizar foto de perfil no banco:', err);
                return res.status(500).json({ message: 'Erro ao atualizar foto' });
            }
            res.json({
                message: 'Imagem atualizada com sucesso!',
                filename: imagePath
            });
        });
    } catch (error) {
        console.error('Erro no upload de imagem:', error);
        res.status(500).json({ message: 'Erro no upload de imagem' });
    }
});

app.use('/uploads', express.static('uploads'));

//rota protegida - página inicial
app.get('/pagInicial', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/pagInicial.html'));
});

//rota para bd
app.get('/getUserData', verificarAutenticacao, (req, res) => {
    const usuarioId = req.session.user.id;

    const query = 'SELECT nome, email, senha, profilePic FROM usuario WHERE id = ?';
    connection.query(query, [usuarioId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao buscar dados do usuário' });
        }
        res.json(results[0]);
    });
});

//rota protegida para o usuario
app.get('/user', verificarAutenticacao, (req, res) => {
    const userId = req.session.user.id;
    
    const query = 'SELECT nome, email, senha, profilePic FROM usuario WHERE id = ?';
    connection.query(query, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao buscar dados do usuário' });
        }
        if (results.length > 0) {
            res.json(results[0]);
        } else {
            res.status(404).json({ message: 'Usuário não encontrado' });
        }
    });
});

// rota de logout
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao encerrar sessão.' });
        }
        res.status(200).json({ message: 'Logout realizado com sucesso!' });
    });
});

// inicializar o servidor
app.listen(5505, () => {
    console.log('Servidor rodando na porta 5505');
});