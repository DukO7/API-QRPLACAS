const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
    origin: '*', // Permite peticiones desde cualquier lugar (incluyendo ngrok)
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }));

// En tu server.js, busca estas líneas y amplía el límite a 10mb o 50mb
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CONFIGURACIÓN DE LA CONEXIÓN ---
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // Tu usuario de MySQL
    password: '',      // Tu contraseña de MySQL
    database: 'petid_db'
});

db.connect(err => {
    if (err) {
        console.error('Error conectando a la DB:', err);
        return;
    }
    console.log('✅ Conectado a la base de datos MySQL');
});

// --- RUTAS DE LA API ---

// 1. Obtener todas las mascotas
app.get('/api/mascotas', (req, res) => {
    const sql = "SELECT * FROM mascotas ORDER BY id DESC";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// 2. Registrar nueva mascota
app.post('/api/mascotas', (req, res) => {
    // 1. Recibimos TODOS los campos del formulario
    const { nombre, dueno, contacto, raza, foto, direccion } = req.body; 
    
    const custom_id = `QRO-${Math.floor(100 + Math.random() * 900)}`;
    const fecha = new Date().toISOString().split('T')[0];

    // 2. Insertamos también la dirección y la foto
    const sql = "INSERT INTO mascotas (custom_id, nombre, dueno, contacto, raza, fecha, foto, direccion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const values = [custom_id, nombre, dueno, contacto, raza, fecha, foto, direccion];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("Error en MySQL:", err);
            return res.status(500).json(err);
        }
        res.json({ 
            id: result.insertId, 
            custom_id, nombre, dueno, contacto, raza, fecha, foto, direccion,
            impreso: 0, estado: 'activo' 
        });
    });
});
// 3. Marcar como impreso (Cola de producción)
app.patch('/api/mascotas/:id/impreso', (req, res) => {
    const { id } = req.params;
    const sql = "UPDATE mascotas SET impreso = 1 WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ message: "Placa marcada como impresa" });
    });
});

// 4. Cambiar estado (Perdido/Activo)
app.patch('/api/mascotas/:id/estado', (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    const sql = "UPDATE mascotas SET estado = ? WHERE id = ?";
    db.query(sql, [estado, id], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ message: "Estado actualizado" });
    });
});

// 5. Eliminar mascota
app.delete('/api/mascotas/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM mascotas WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ message: "Registro eliminado" });
    });
});

// RUTA EXCLUSIVA PARA INSERTAR EN HISTORIAL
app.post('/api/historial', (req, res) => {
    const { mascota_id, evento, detalle } = req.body;
    
    console.log("Intentando insertar historial:", req.body); // Esto saldrá en tu terminal de Node

    const sql = "INSERT INTO historial (mascota_id, evento, detalle) VALUES (?, ?, ?)";
    db.query(sql, [mascota_id, evento, detalle], (err, result) => {
        if (err) {
            console.error("ERROR EN LA BASE DE DATOS:", err);
            return res.status(500).json({ error: err.message });
        }
        console.log("✅ Registro insertado con ID:", result.insertId);
        res.json({ message: "Historial guardado", id: result.insertId });
    });
});

app.get('/api/historial/:id', (req, res) => {
    const { id } = req.params;
    const sql = "SELECT * FROM historial WHERE mascota_id = ? ORDER BY fecha DESC";
    db.query(sql, [id], (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});

// 3. Marcar como impreso + REGISTRO EN HISTORIAL
app.patch('/api/mascotas/:id/impreso', (req, res) => {
    const { id } = req.params;
    const sqlUpdate = "UPDATE mascotas SET impreso = 1 WHERE id = ?";
    
    db.query(sqlUpdate, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        
        // INSERTAR EN HISTORIAL
        const sqlHistorial = "INSERT INTO historial (mascota_id, evento, detalle) VALUES (?, ?, ?)";
        db.query(sqlHistorial, [id, "Producción Finalizada", "La placa fue fabricada y el QR está listo para entrega."], (hErr) => {
            if (hErr) console.error("Error historial:", hErr);
            return res.json({ message: "Impreso e historial registrado" });
        });
    });
});

// 4. Cambiar estado + REGISTRO EN HISTORIAL
// --- CAMBIAR ESTADO + REGISTRO EN HISTORIAL ---
app.patch('/api/mascotas/:id/estado', (req, res) => {
    const { id } = req.params;
    const { estado, motivo } = req.body; // <--- Fíjate que recibas 'motivo'

    db.query("UPDATE mascotas SET estado = ? WHERE id = ?", [estado, id], (err) => {
        if (err) return res.status(500).json(err);
        
        // Insertamos en historial usando el motivo que viene de React
        const sqlHistorial = "INSERT INTO historial (mascota_id, evento, detalle) VALUES (?, ?, ?)";
        const detalleHistorial = motivo || `Cambio de estado a ${estado}`;
        
        db.query(sqlHistorial, [id, "Actualización de Estado", detalleHistorial], (hErr) => {
            if (hErr) return res.status(500).json(hErr);
            res.json({ message: "Actualizado correctamente" });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});