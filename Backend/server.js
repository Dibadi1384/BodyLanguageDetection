const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load environment variables
require("dotenv").config();
const nlpRoute = require("./routes/nlp");

const app = express();
// Use the PORT from env if provided, otherwise ask the OS for an available port (0)
const PORT = process.env.PORT ? Number(process.env.PORT) : 0;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/nlp", nlpRoute);

app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/upload') {
    console.log(`[UPLOAD REQUEST] Incoming upload request: headers =>`, {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });
  }
  next();
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for video file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/quicktime',
    'video/wmv',
    'video/flv',
    'video/webm',
    'video/mkv'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.error(`[UPLOAD ERROR] Rejected file with mimetype '${file.mimetype}' and original name '${file.originalname}'`);
    cb(new Error(`Only video files are allowed. Received mimetype '${file.mimetype}'.`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  }
});

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Video Upload Server is running!' });
});

// Upload endpoint
app.post('/upload', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      console.error('[UPLOAD ERROR] Multer succeeded but req.file missing.');
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      destination: req.file.destination,
      path: req.file.path,
      uploadedAt: new Date().toISOString()
    };

    console.log('[UPLOAD SUCCESS] Video stored:', fileInfo);

    res.json({
      message: 'Video uploaded successfully!',
      file: fileInfo
    });
  } catch (error) {
    console.error('[UPLOAD ERROR] Unexpected exception:', error);
    res.status(500).json({ error: 'Failed to upload video', details: error.message });
  }
});

// Get list of uploaded videos
app.get('/videos', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const videoFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'].includes(ext);
      })
      .map(file => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          uploadedAt: stats.mtime
        };
      });

    res.json({ videos: videoFiles });
  } catch (error) {
    console.error('Error reading videos:', error);
    res.status(500).json({ error: 'Failed to read videos' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      console.error('[MULTER ERROR] File size limit exceeded');
      return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
    }
    console.error('[MULTER ERROR]', error);
    return res.status(400).json({ error: error.message });
  }

  console.error('[GENERAL ERROR]', error);
  const statusCode = /mimetype/i.test(error.message) ? 400 : 500;
  res.status(statusCode).json({ error: error.message || 'Something went wrong!' });
});

app.use('/uploads', express.static(uploadsDir));

const server = app.listen(PORT, () => {
  // When PORT is 0, the OS assigns a free port — read it from the server instance
  const actualPort = server.address() && server.address().port ? server.address().port : PORT;
  console.log(`Server is running on port ${actualPort}`);
  console.log(`Upload directory: ${uploadsDir}`);
  // Write the chosen port to a file so other tools (like the frontend dev server) can discover it
  try {
    const portFile = path.join(__dirname, '.backend-port');
    fs.writeFileSync(portFile, String(actualPort), { encoding: 'utf8' });
    console.log(`Wrote backend port to ${portFile}`);
  } catch (err) {
    console.error('Failed to write backend port file:', err);
  }
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down server...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after a timeout
  setTimeout(() => {
    console.error('Could not close connections in time, forcing shutdown');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

