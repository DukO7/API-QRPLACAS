const express = require('express');
const { Pool } = require('pg'); // Cambiado de mysql2 a pg
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- CONFIGURACIÓN DE CORS ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- CONFIGURACIÓN DE LA CONEXIÓN A POSTGRESQL ---
// Render inyecta automáticamente DATABASE_URL en las variables de entorno
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Obligatorio para conectar con Render
    }
});

// Verificar conexión
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error conectando a PostgreSQL:', err.stack);
    }
    console.log('✅ Conectado a la base de datos PostgreSQL en Render');
    release();
});

// --- RUTAS DE LA API ---

// 1. Obtener todas las mascotas
app.get('/api/mascotas', async (req, res) => {
    const sql = "SELECT * FROM mascotas ORDER BY id DESC";
    try {
        const result = await pool.query(sql);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json(err);
    }
});

// 2. Registrar nueva mascota
app.post('/api/mascotas', async (req, res) => {
    const { nombre, dueno, contacto, raza, foto, direccion } = req.body; 
    const custom_id = `QRO-${Math.floor(100 + Math.random() * 900)}`;
    const fecha = new Date().toISOString().split('T')[0];

    const sql = `INSERT INTO mascotas (custom_id, nombre, dueno, contacto, raza, fecha, foto, direccion) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
    const values = [custom_id, nombre, dueno, contacto, raza, fecha, foto, direccion];

    try {
        const result = await pool.query(sql, values);
        res.json({ 
            id: result.rows[0].id, 
            custom_id, nombre, dueno, contacto, raza, fecha, foto, direccion,
            impreso: 0, estado: 'protegido' 
        });
    } catch (err) {
        console.error("Error en Postgres:", err);
        res.status(500).json(err);
    }
});

// 3. Marcar como impreso + Registro en historial
app.patch('/api/mascotas/:id/impreso', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("UPDATE mascotas SET impreso = 1 WHERE id = $1", [id]);
        
        const sqlHistorial = "INSERT INTO historial (mascota_id, evento, detalle) VALUES ($1, $2, $3)";
        await pool.query(sqlHistorial, [id, "Producción Finalizada", "La placa fue fabricada y el QR está listo para entrega."]);
        
        res.json({ message: "Impreso e historial registrado" });
    } catch (err) {
        res.status(500).json(err);
    }
});

// 4. Cambiar estado + Registro en historial
app.patch('/api/mascotas/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado, motivo } = req.body; 

    try {
        await pool.query("UPDATE mascotas SET estado = $1 WHERE id = $2", [estado, id]);
        
        const sqlHistorial = "INSERT INTO historial (mascota_id, evento, detalle) VALUES ($1, $2, $3)";
        const detalleHistorial = motivo || `Cambio de estado a ${estado}`;
        
        await pool.query(sqlHistorial, [id, "Actualización de Estado", detalleHistorial]);
        res.json({ message: "Actualizado correctamente" });
    } catch (err) {
        res.status(500).json(err);
    }
});

// 5. Eliminar mascota
app.delete('/api/mascotas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM mascotas WHERE id = $1", [id]);
        res.json({ message: "Registro eliminado" });
    } catch (err) {
        res.status(500).json(err);
    }
});

// RUTA PARA INSERTAR EN HISTORIAL (GPS)
app.post('/api/historial', async (req, res) => {
    const { mascota_id, evento, detalle } = req.body;
    const sql = "INSERT INTO historial (mascota_id, evento, detalle) VALUES ($1, $2, $3) RETURNING id";
    try {
        const result = await pool.query(sql, [mascota_id, evento, detalle]);
        res.json({ message: "Historial guardado", id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener historial de una mascota
app.get('/api/historial/:id', async (req, res) => {
    const { id } = req.params;
    const sql = "SELECT * FROM historial WHERE mascota_id = $1 ORDER BY fecha DESC";
    try {
        const result = await pool.query(sql, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json(err);
    }
});

// Ruta pública para el QR
app.get('/api/mascotas/public/:custom_id', async (req, res) => {
    const { custom_id } = req.params;
    try {
        const result = await pool.query("SELECT * FROM mascotas WHERE custom_id = $1", [custom_id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json(err);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});