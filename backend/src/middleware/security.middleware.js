const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * Security middleware for file operations
 */

// Rate limiting for file operations
const createFileRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Specific rate limiters for different operations
const uploadRateLimit = createFileRateLimiter(
  parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  parseInt(process.env.UPLOAD_RATE_LIMIT_MAX) || 10, // 10 uploads
  'Too many file upload requests, please try again later'
);

const downloadRateLimit = createFileRateLimiter(
  parseInt(process.env.DOWNLOAD_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  parseInt(process.env.DOWNLOAD_RATE_LIMIT_MAX) || 50, // 50 downloads
  'Too many file download requests, please try again later'
);

/**
 * File type validation using magic numbers
 */
const validateFileSignature = (buffer, mimeType) => {
  if (!buffer || buffer.length < 4) return false;

  const signatures = {
    // Images
    'image/jpeg': [
      [0xFF, 0xD8, 0xFF]
    ],
    'image/png': [
      [0x89, 0x50, 0x4E, 0x47]
    ],
    'image/gif': [
      [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
    ],
    'image/webp': [
      [0x52, 0x49, 0x46, 0x46] // RIFF header
    ],

    // Videos
    'video/mp4': [
      [0x66, 0x74, 0x79, 0x70] // ftyp at offset 4
    ],
    'video/webm': [
      [0x1A, 0x45, 0xDF, 0xA3]
    ],

    // Documents
    'application/pdf': [
      [0x25, 0x50, 0x44, 0x46] // %PDF
    ],

    // Archives
    'application/zip': [
      [0x50, 0x4B, 0x03, 0x04],
      [0x50, 0x4B, 0x05, 0x06],
      [0x50, 0x4B, 0x07, 0x08]
    ]
  };

  const fileSignatures = signatures[mimeType];
  if (!fileSignatures) return true; // Allow if no signature check defined

  return fileSignatures.some(signature => {
    for (let i = 0; i < signature.length && i < buffer.length; i++) {
      if (buffer[i] !== signature[i]) return false;
    }
    return true;
  });
};

/**
 * Sanitize file names to prevent path traversal
 */
const sanitizeFileName = (fileName) => {
  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace dangerous characters
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 255); // Limit length
};

/**
 * Validate S3 bucket configuration
 */
const validateS3Config = () => {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required S3 configuration: ${missing.join(', ')}`);
  }
};

/**
 * Log security events
 */
const securityLogger = {
  logFileUpload: (userId, fileName, fileSize, ip) => {
    console.log(`[SECURITY] File upload: User ${userId}, File: ${fileName}, Size: ${fileSize}, IP: ${ip}`);
  },
  
  logFileDownload: (userId, fileId, ip) => {
    console.log(`[SECURITY] File download: User ${userId}, File: ${fileId}, IP: ${ip}`);
  },
  
  logUnauthorizedAccess: (userId, fileId, ip) => {
    console.warn(`[SECURITY] Unauthorized file access attempt: User ${userId}, File: ${fileId}, IP: ${ip}`);
  },
  
  logRateLimitExceeded: (ip, endpoint) => {
    console.warn(`[SECURITY] Rate limit exceeded: IP ${ip}, Endpoint: ${endpoint}`);
  },
  
  logFileValidationFailure: (fileName, reason, ip) => {
    console.warn(`[SECURITY] File validation failed: File ${fileName}, Reason: ${reason}, IP: ${ip}`);
  }
};

/**
 * Enhanced input validation middleware
 */
const enhancedValidation = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  
  // Validate request size
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length']);
    const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024;
    
    if (contentLength > maxSize) {
      securityLogger.logFileValidationFailure('unknown', 'File too large', ip);
      return res.status(413).json({ 
        error: 'File too large',
        maxSize: `${maxSize / 1024 / 1024}MB`
      });
    }
  }
  
  // Validate JSON in body
  if (req.body && typeof req.body === 'object') {
    try {
      // Check for potential JSON injection
      const bodyStr = JSON.stringify(req.body);
      if (bodyStr.includes('__proto__') || bodyStr.includes('constructor')) {
        securityLogger.logFileValidationFailure('unknown', 'Potential prototype pollution', ip);
        return res.status(400).json({ error: 'Invalid request format' });
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON format' });
    }
  }
  
  next();
};

/**
 * File content scanning middleware (basic)
 */
const scanFileContent = async (req, res, next) => {
  if (!req.body.fileName) return next();
  
  const fileName = req.body.fileName.toLowerCase();
  const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
  
  if (suspiciousExtensions.some(ext => fileName.endsWith(ext))) {
    const ip = req.ip || req.connection.remoteAddress;
    securityLogger.logFileValidationFailure(req.body.fileName, 'Suspicious file extension', ip);
    return res.status(400).json({ 
      error: 'File type not allowed for security reasons' 
    });
  }
  
  next();
};

module.exports = {
  uploadRateLimit,
  downloadRateLimit,
  validateFileSignature,
  sanitizeFileName,
  validateS3Config,
  securityLogger,
  enhancedValidation,
  scanFileContent
};