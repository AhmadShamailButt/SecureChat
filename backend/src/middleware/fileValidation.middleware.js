const fileUploadService = require('../services/fileUpload.service');

/**
 * Middleware to validate file upload requests
 */
const validateFileUpload = (req, res, next) => {
  const { fileName, fileSize, mimeType, receiverId, conversationId, encryptedFileKey, iv, fileHash } = req.body;

  // Debug logging
  console.log('File upload validation - received body:', req.body);
  console.log('File upload validation - extracted fields:', {
    fileName, fileSize, mimeType, receiverId, conversationId, encryptedFileKey: !!encryptedFileKey, iv: !!iv, fileHash
  });

  // Check required fields
  const requiredFields = ['fileName', 'fileSize', 'mimeType', 'receiverId', 'conversationId', 'encryptedFileKey', 'iv', 'fileHash'];
  const missingFields = requiredFields.filter(field => !req.body[field]);

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: 'Missing required fields',
      missingFields
    });
  }

  // Validate file name
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    return res.status(400).json({
      error: 'Invalid file name'
    });
  }

  if (fileName.length > 255) {
    return res.status(400).json({
      error: 'File name too long (maximum 255 characters)'
    });
  }

  // Validate file size
  const parsedFileSize = parseInt(fileSize);
  if (isNaN(parsedFileSize) || parsedFileSize <= 0) {
    return res.status(400).json({
      error: 'Invalid file size'
    });
  }

  const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024; // 100MB
  if (parsedFileSize > maxFileSize) {
    return res.status(400).json({
      error: `File size exceeds maximum allowed size of ${maxFileSize / 1024 / 1024}MB`
    });
  }

  // Validate MIME type
  if (!fileUploadService.isValidFileType(mimeType)) {
    return res.status(400).json({
      error: 'File type not allowed',
      allowedTypes: [
        'Images: jpeg, png, gif, webp',
        'Videos: mp4, webm, quicktime, avi',
        'Documents: pdf, doc, docx, xls, xlsx, txt',
        'Archives: zip, rar'
      ]
    });
  }

  // Validate receiver ID format (MongoDB ObjectId)
  const mongoose = require('mongoose');
  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    return res.status(400).json({
      error: 'Invalid receiver ID format'
    });
  }

  // Validate conversation ID
  if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
    return res.status(400).json({
      error: 'Invalid conversation ID'
    });
  }

  // Validate encryption fields
  try {
    JSON.parse(encryptedFileKey);
    JSON.parse(iv);
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid encryption data format'
    });
  }

  // Validate file hash
  if (typeof fileHash !== 'string' || fileHash.length !== 64) { // SHA-256 produces 64-character hex string
    return res.status(400).json({
      error: 'Invalid file hash format'
    });
  }

  // Sanitize and normalize data
  req.body.fileName = fileName.trim();
  req.body.fileSize = parsedFileSize;
  req.body.mimeType = mimeType.toLowerCase();
  req.body.conversationId = conversationId.trim();

  next();
};

/**
 * Middleware to validate file download requests
 */
const validateFileDownload = (req, res, next) => {
  const { fileId } = req.params;

  if (!fileId || typeof fileId !== 'string') {
    return res.status(400).json({
      error: 'Invalid file ID'
    });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(fileId)) {
    return res.status(400).json({
      error: 'Invalid file ID format'
    });
  }

  next();
};

/**
 * Middleware to validate file deletion requests
 */
const validateFileDelete = (req, res, next) => {
  const { fileId } = req.params;

  if (!fileId || typeof fileId !== 'string') {
    return res.status(400).json({
      error: 'Invalid file ID'
    });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(fileId)) {
    return res.status(400).json({
      error: 'Invalid file ID format'
    });
  }

  next();
};

module.exports = {
  validateFileUpload,
  validateFileDownload,
  validateFileDelete
};