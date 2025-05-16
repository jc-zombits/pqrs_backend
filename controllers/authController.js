const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Función para registrar nuevos usuarios
const register = async (req, res) => {
  try {
    // Verifica primero que el body existe
    if (!req.body) {
      return res.status(400).json({ error: 'Cuerpo de la solicitud vacío' });
    }

    const { name, email, password } = req.body;

    // Validación más detallada
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Nombre inválido o faltante' });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido o faltante' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Verificar si el usuario ya existe
    const userExists = await pool.query(
      'SELECT * FROM sis_catastro_tramites.users WHERE email = $1', 
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // Hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear nuevo usuario
    const newUser = await pool.query(
      'INSERT INTO sis_catastro_tramites.users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );

    // Generar token JWT
    const token = generateToken(newUser.rows[0].id);

    res.status(201).json({
      id: newUser.rows[0].id,
      name: newUser.rows[0].name,
      email: newUser.rows[0].email,
      token
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      error: 'Error en el servidor',
      details: error.message 
    });
  }
};

// Función para login de usuarios
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validación básica
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    // Buscar usuario
    const user = await pool.query(
      'SELECT * FROM sis_catastro_tramites.users WHERE email = $1',
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar token JWT
    const token = generateToken(user.rows[0].id);

    res.json({
      id: user.rows[0].id,
      name: user.rows[0].name,
      email: user.rows[0].email,
      token
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

// Función para generar token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Middleware para proteger rutas
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Obtener token del header
      token = req.headers.authorization.split(' ')[1];

      // Verificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Obtener usuario del token
      const user = await pool.query(
        'SELECT id, name, email FROM sis_catastro_tramites.users WHERE id = $1',
        [decoded.id]
      );

      if (user.rows.length === 0) {
        return res.status(401).json({ error: 'Usuario no encontrado' });
      }

      req.user = user.rows[0];
      next();

    } catch (error) {
      console.error('Error en autenticación:', error);
      res.status(401).json({ error: 'No autorizado' });
    }
  }

  if (!token) {
    res.status(401).json({ error: 'No se proporcionó token' });
  }
};

module.exports = {
  register,
  login,
  protect
};