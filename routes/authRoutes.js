const express = require('express');
const router = express.Router();
const { register, login, protect } = require('../controllers/authController');

/**
 * @route POST /api/auth/register
 * @desc Registrar nuevo usuario
 * @access Public
 */
router.post('/register', register);

/**
 * @route POST /api/auth/login
 * @desc Iniciar sesión
 * @access Public
 */
router.post('/login', login);

module.exports = router;