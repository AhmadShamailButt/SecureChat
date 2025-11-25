const express = require('express');
const router = express.Router();

const contactsController = require('../controllers/contactsController');
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply auth middleware to all messaging routes
router.use('/messages', authMiddleware);

// Contacts routes
router.get('/messages/contacts', contactsController.getContacts);

// Messages routes
router.get('/messages/:conversationId', messageController.getMessages);
router.post('/messages', messageController.postMessage);

// Create or get conversation
router.get('/messages/conversation/:userId', messageController.getOrCreateConversation);

module.exports = router;

