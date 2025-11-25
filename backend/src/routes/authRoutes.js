const express = require('express');
const router = express.Router();
const { router: signupRouter } = require('../controllers/authController');
const signinRouter = require('../controllers/signinController');

// Signup route - POST /api/auth/signup
router.use('/signup', signupRouter);

// Signin/Login route - POST /api/auth/login
router.use('/login', signinRouter);

// Also support /signin endpoint for compatibility
router.use('/signin', signinRouter);

module.exports = router;

