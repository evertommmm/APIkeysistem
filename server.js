const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Inicializa o Banco de Dados SQLite (Arquivo local)
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Erro ao abrir banco:', err.message);
    else console.log('Conectado ao banco de dados SQLite local.');
});

// Cria a tabela se não existir
db.run(`CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    hwid TEXT,
    uses INTEGER DEFAULT 0,
    expires_at DATETIME,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// --- ENDPOINTS DA API ---

// Autenticação (Roblox)
app.post('/api/authenticate', (req, res) => {
    const { key, hwid } = req.body;
    if (!key) return res.status(400).json({ success: false, message: 'Chave não fornecida' });

    db.get('SELECT * FROM keys WHERE key = ?', [key], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: 'Erro no servidor' });
        if (!row) return res.json({ success: false, message: 'Chave inválida' });
        if (row.status !== 'active') return res.json({ success: false, message: 'Chave expirada ou banida' });

        // Verifica expiração
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
            db.run('UPDATE keys SET status = "expired" WHERE id = ?', [row.id]);
            return res.json({ success: false, message: 'Chave expirada' });
        }

        // Verifica HWID
        if (!row.hwid) {
            db.run('UPDATE keys SET hwid = ?, uses = uses + 1 WHERE id = ?', [hwid, row.id]);
            return res.json({ success: true, message: 'HWID vinculado com sucesso' });
        } else if (row.hwid !== hwid) {
            return res.json({ success: false, message: 'HWID não condiz (Chave em uso em outro PC)' });
        }

        db.run('UPDATE keys SET uses = uses + 1 WHERE id = ?', [row.id]);
        res.json({ success: true, message: 'Autenticado com sucesso' });
    });
});

// --- PAINEL ADMIN ---

// Login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) res.json({ success: true });
    else res.status(401).json({ success: false, message: 'Senha incorreta' });
});

// Listar Chaves
app.get('/api/admin/keys', (req, res) => {
    db.all('SELECT * FROM keys ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, keys: rows });
    });
});

// Criar Chave
app.post('/api/admin/keys', (req, res) => {
    const { key, expires_in, description } = req.body;
    let expires_at = null;

    if (expires_in !== 'lifetime') {
        const days = parseInt(expires_in);
        expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + days);
        expires_at = expires_at.toISOString();
    }

    db.run('INSERT INTO keys (key, expires_at, description) VALUES (?, ?, ?)', [key, expires_at, description], (err) => {
        if (err) return res.status(400).json({ success: false, message: 'Chave já existe' });
        res.json({ success: true });
    });
});

// Deletar Chave
app.delete('/api/admin/keys/:id', (req, res) => {
    db.run('DELETE FROM keys WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
