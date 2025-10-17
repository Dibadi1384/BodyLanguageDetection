# Debugging Guide for Video Upload Application

## Backend Debugging

### Method 1: VS Code Debugger (Recommended)

1. **Open VS Code** in the Backend folder
2. **Set breakpoints** by clicking on the line numbers in `server.js`
3. **Press F5** or go to Run → Start Debugging
4. **Select "Debug Backend Server"** from the dropdown
5. The debugger will start and pause at your breakpoints

#### Debug Configurations Available:
- **Debug Backend Server**: Standard debugging with breakpoints
- **Debug Backend with Nodemon**: Auto-restart debugging (recommended for development)

### Method 2: Chrome DevTools

1. **Start the debug server**:
   ```bash
   cd Backend
   npm run debug
   ```

2. **Open Chrome** and go to `chrome://inspect`
3. **Click "Open dedicated DevTools for Node"**
4. **Set breakpoints** in the DevTools Sources tab
5. **Interact with your API** to trigger breakpoints

### Method 3: Command Line Debugging

```bash
# Basic debugging
npm run debug

# Debug with break on first line (useful for startup issues)
npm run debug:break

# Debug with nodemon (auto-restart)
npm run debug:nodemon
```

## Common Debug Scenarios

### 1. Upload Issues
```javascript
// Add this to your upload route for debugging
app.post('/upload', upload.single('video'), (req, res) => {
  console.log('Upload request received');
  console.log('File:', req.file);
  console.log('Body:', req.body);
  
  // Your existing code...
});
```

### 2. File System Issues
```javascript
// Debug file operations
const fs = require('fs');
const path = require('path');

// Check if uploads directory exists
console.log('Uploads directory exists:', fs.existsSync(uploadsDir));
console.log('Uploads directory path:', uploadsDir);

// List files in uploads directory
try {
  const files = fs.readdirSync(uploadsDir);
  console.log('Files in uploads:', files);
} catch (error) {
  console.error('Error reading uploads directory:', error);
}
```

### 3. Multer Configuration Issues
```javascript
// Add error handling for multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB
  }
});

// Debug multer errors
app.use((error, req, res, next) => {
  console.error('Multer Error:', error);
  // Your existing error handling...
});
```

### 4. CORS Issues
```javascript
// Debug CORS
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Add logging for CORS
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} from ${req.headers.origin}`);
  next();
});
```

## Frontend Debugging

### Browser DevTools
1. **Open Chrome DevTools** (F12)
2. **Go to Network tab** to see API calls
3. **Check Console tab** for JavaScript errors
4. **Use React DevTools** extension for component debugging

### Common Frontend Issues
```javascript
// Debug upload progress
onUploadProgress: (progressEvent) => {
  console.log('Upload progress:', progressEvent);
  const percentCompleted = Math.round(
    (progressEvent.loaded * 100) / progressEvent.total
  );
  console.log(`Upload: ${percentCompleted}%`);
  setUploadProgress(percentCompleted);
}
```

## Debugging Tips

### 1. Environment Variables
Create a `.env` file in the Backend folder:
```
PORT=5000
NODE_ENV=development
DEBUG=*
```

### 2. Logging Levels
```javascript
// Add different logging levels
const DEBUG = process.env.NODE_ENV === 'development';

function debugLog(message, data = null) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data);
  }
}

// Usage
debugLog('File uploaded', { filename: req.file.filename });
```

### 3. Error Tracking
```javascript
// Enhanced error logging
app.use((error, req, res, next) => {
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({ 
    error: 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
});
```

### 4. API Testing
Use tools like Postman or curl to test your API. If your backend is using a dynamic port, read the chosen port from `Backend/.backend-port` or set the `PORT` env variable before starting the backend.

```bash
# If you set PORT explicitly, use that port (example uses 5000):
curl -X POST http://localhost:5000/upload \
  -F "video=@/path/to/your/video.mp4"

# If backend chose a dynamic port, read it from Backend/.backend-port:
BACKEND_PORT=$(cat Backend/.backend-port)
curl -X POST "http://localhost:${BACKEND_PORT}/upload" \
  -F "video=@/path/to/your/video.mp4"

# Test videos list endpoint (dynamic port):
curl "http://localhost:${BACKEND_PORT}/videos"
```

## Troubleshooting Common Issues

### Port Already in Use
If you set an explicit `PORT` in `.env` and it conflicts with another process, adjust the port or kill the conflicting process. If you don't set `PORT`, the backend will automatically pick a free port.

On macOS / Linux you can find processes using a port like this:
```bash
# Replace 5000 with the port you're checking
lsof -i :5000
```

To kill a process by PID:
```bash
kill <PID>
```

### File Upload Fails
1. Check file size limits
2. Verify file format is supported
3. Check uploads directory permissions
4. Look at network requests in browser DevTools

### CORS Errors
1. Verify backend is running on correct port
2. Check CORS configuration
3. Ensure frontend proxy is configured correctly

### Database/File System Issues
1. Check if uploads directory exists
2. Verify write permissions
3. Check available disk space
4. Look at file system error messages

