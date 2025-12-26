const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { VideoProcessor } = require('./routes/video_processor');

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
    
    // Check if refined prompt was sent from frontend
    const refinedPrompt = req.body.refinedPrompt;
    const skipRefinement = !!refinedPrompt; // Skip refinement if refined prompt is provided
    
    if (refinedPrompt) {
      console.log('[UPLOAD DEBUG] Received refined prompt from frontend:', refinedPrompt);
    } else {
      console.log('[UPLOAD DEBUG] No refined prompt received, will use default or refine');
    }
    
    // Auto-start processing pipeline asynchronously
    const autoProcess = process.env.AUTO_PROCESS !== 'false';
    if (autoProcess) {
      // Use refined prompt from frontend if available, otherwise use default
      const taskDescription = refinedPrompt || process.env.DEFAULT_TASK_DESCRIPTION || 'Detect people and analyze their emotions with bounding boxes.';
      console.log('[UPLOAD DEBUG] Using task description:', taskDescription);
      console.log('[UPLOAD DEBUG] Will skip refinement:', skipRefinement);
      // Use absolute path for workDir to ensure consistency with static file serving
      const workDir = process.env.WORK_DIR 
        ? path.resolve(process.env.WORK_DIR)
        : path.resolve(__dirname, 'work');
      console.log('[SERVER] Work directory for VideoProcessor:', workDir);
      
      const options = {
        frameInterval: parseInt(process.env.FRAME_INTERVAL || '60'),
        batchSize: parseInt(process.env.BATCH_SIZE || '4'),
        maxFrames: process.env.MAX_FRAMES ? parseInt(process.env.MAX_FRAMES) : null,
        keepIntermediateFiles: process.env.KEEP_INTERMEDIATE_FILES === 'true',
        workDir: workDir
      };

      // Write a status sidecar file next to the uploaded video
      const statusPath = path.join(uploadsDir, `${path.basename(fileInfo.filename, path.extname(fileInfo.filename))}.status.json`);
      const status = {
        status: 'queued',
        stage: 0,
        videoPath: fileInfo.path,
        taskDescription,
        isRefinedPrompt: skipRefinement,
        models: {
          promptRefinement: 'gemini-2.0-flash',
          frameAnalysis: 'Qwen/Qwen2.5-VL-7B-Instruct'
        },
        options,
        createdAt: new Date().toISOString()
      };
      console.log('[UPLOAD DEBUG] Created status file:', statusPath);
      console.log('[UPLOAD DEBUG] Models that will be used:', status.models);
      try {
        fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
      } catch (e) {
        console.error('Failed to write status file:', e);
      }

      // Kick off processing without blocking the response
      (async () => {
        try {
          // Status update function to write status file
          const updateStatusFile = (statusInfo) => {
            try {
              const currentStatus = {
                ...status,
                status: statusInfo.status,
                stage: statusInfo.stage,
                currentStage: statusInfo.action || statusInfo.status,
                timestamp: statusInfo.timestamp,
                models: statusInfo.models || options.models,
                details: statusInfo
              };
              
              // Preserve important fields
              if (statusInfo.status === 'running' && !currentStatus.startedAt) {
                currentStatus.startedAt = new Date().toISOString();
              }
              
              fs.writeFileSync(statusPath, JSON.stringify(currentStatus, null, 2));
              console.log('[STATUS UPDATE]', statusInfo.status, '- Stage', statusInfo.stage, ':', statusInfo.action);
            } catch (e) {
              console.error('[STATUS UPDATE ERROR]', e);
            }
          };
          
          // Add status callback to options
          options.statusCallback = updateStatusFile;
          
          const processor = new VideoProcessor(options);
          // update status to running
          updateStatusFile({
            status: 'running',
            stage: 0,
            action: 'Video processing started',
            timestamp: new Date().toISOString()
          });
          
          console.log('[PROCESSING DEBUG] Starting video processing with task:', taskDescription);
          console.log('[PROCESSING DEBUG] Skip refinement flag:', skipRefinement);
          const result = await processor.processVideo(fileInfo.path, taskDescription, null, skipRefinement);
          
          const finalStatus = {
            ...status,
            status: result.success ? 'completed' : 'failed',
            stage: result.success ? 5 : -1,
            startedAt: status.startedAt,
            completedAt: new Date().toISOString(),
            detectionsPath: result.detectionsPath || null,
            annotatedVideoPath: result.annotatedVideoPath || null,
            error: result.success ? null : result.error,
            refinedTask: result.refinedTask || taskDescription,
            models: result.models || {},
            processingStages: result.processingStages || {}
          };
          fs.writeFileSync(statusPath, JSON.stringify(finalStatus, null, 2));
          console.log('[PROCESSING DONE]', finalStatus);
        } catch (procErr) {
          console.error('Processing pipeline failed:', procErr);
          try {
            const errorStatus = {
              ...status,
              status: 'failed',
              stage: -1,
              error: procErr.message,
              errorStack: procErr.stack,
              completedAt: new Date().toISOString()
            };
            fs.writeFileSync(statusPath, JSON.stringify(errorStatus, null, 2));
          } catch {}
        }
      })();
    }

    res.json({
      message: 'Video uploaded successfully!',
      file: fileInfo,
      autoProcess: autoProcess,
      note: autoProcess ? 'Processing started in background. Check status endpoint.' : 'Set AUTO_PROCESS=true to enable automatic processing.'
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

// Status endpoint to check processing for a given uploaded file stem
app.get('/status/:stem', (req, res) => {
  const stem = req.params.stem;
  const statusPath = path.join(uploadsDir, `${stem}.status.json`);
  try {
    if (!fs.existsSync(statusPath)) {
      return res.status(404).json({ error: 'Status not found', stem });
    }
    const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    res.json(data);
  } catch (err) {
    console.error('Status read error:', err);
    res.status(500).json({ error: 'Failed to read status', details: err.message });
  }
});

// Thumbnail endpoint - generate thumbnail from video
app.get('/thumbnail/:stem', (req, res) => {
  const stem = req.params.stem;
  const thumbnailDir = path.join(uploadsDir, 'thumbnails');
  
  // Ensure thumbnail directory exists
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }
  
  const thumbnailPath = path.join(thumbnailDir, `${stem}.jpg`);
  
  // If thumbnail already exists, serve it
  if (fs.existsSync(thumbnailPath)) {
    res.contentType('image/jpeg');
    return res.sendFile(path.resolve(thumbnailPath));
  }
  
  // Find the video file
  const videoFiles = fs.readdirSync(uploadsDir).filter(file => {
    const fileStem = file.replace(/\.[^/.]+$/, "");
    return fileStem === stem && ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'].includes(path.extname(file).toLowerCase());
  });
  
  if (videoFiles.length === 0) {
    return res.status(404).json({ error: 'Video not found' });
  }
  
  const videoPath = path.join(uploadsDir, videoFiles[0]);
  
  // Generate thumbnail using ffmpeg (extract frame at 1 second)
  const isWindows = process.platform === 'win32';
  const ffmpegCmd = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
  
  const ffmpegProcess = spawn(ffmpegCmd, [
    '-i', videoPath,
    '-ss', '00:00:01',  // Seek to 1 second
    '-vframes', '1',    // Extract 1 frame
    '-q:v', '2',        // High quality
    '-y',               // Overwrite output
    thumbnailPath
  ]);
  
  let errorOutput = '';
  
  ffmpegProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });
  
  ffmpegProcess.on('error', (error) => {
    if (error.code === 'ENOENT') {
      console.error('[THUMBNAIL] ffmpeg not found');
      return res.status(500).json({ error: 'ffmpeg not available for thumbnail generation' });
    }
    console.error('[THUMBNAIL] Error:', error);
    return res.status(500).json({ error: 'Failed to generate thumbnail', details: error.message });
  });
  
  ffmpegProcess.on('close', (code) => {
    if (code === 0 && fs.existsSync(thumbnailPath)) {
      res.contentType('image/jpeg');
      res.sendFile(path.resolve(thumbnailPath));
    } else {
      console.error('[THUMBNAIL] Failed to generate thumbnail:', errorOutput);
      res.status(500).json({ error: 'Failed to generate thumbnail', details: errorOutput });
    }
  });
});

// Debug endpoint to check if work directory files are accessible
app.get('/debug/work/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(workDirStatic, filename);
  console.log('[DEBUG] Checking file:', filePath);
  console.log('[DEBUG] Work directory:', workDirStatic);
  console.log('[DEBUG] File exists:', fs.existsSync(filePath));
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    res.json({
      exists: true,
      path: filePath,
      size: stats.size,
      modified: stats.mtime
    });
  } else {
    // List files in work directory for debugging
    const files = fs.existsSync(workDirStatic) 
      ? fs.readdirSync(workDirStatic).map(f => ({
          name: f,
          path: path.join(workDirStatic, f),
          exists: fs.existsSync(path.join(workDirStatic, f))
        }))
      : [];
    res.status(404).json({
      exists: false,
      requested: filename,
      workDir: workDirStatic,
      workDirExists: fs.existsSync(workDirStatic),
      availableFiles: files
    });
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
// Serve thumbnails
app.use('/thumbnails', express.static(path.join(uploadsDir, 'thumbnails')));
// Also serve the work directory where annotated videos and detections are stored
// Use absolute path to ensure consistency with VideoProcessor
const workDirStatic = process.env.WORK_DIR 
  ? path.resolve(process.env.WORK_DIR)
  : path.resolve(__dirname, 'work');
console.log('[SERVER] Work directory for static serving:', workDirStatic);
// Ensure work directory exists
if (!fs.existsSync(workDirStatic)) {
  fs.mkdirSync(workDirStatic, { recursive: true });
  console.log('[SERVER] Created work directory:', workDirStatic);
}
app.use('/work', express.static(workDirStatic, {
  setHeaders: (res, filePath) => {
    // Allow cross-origin video playback from the frontend dev server
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    
    // Set proper content type for mp4 files
    if (filePath.toLowerCase().endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      // Enable range requests for video streaming
      res.setHeader('Accept-Ranges', 'bytes');
    }
    // Disable aggressive caching while developing
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

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

