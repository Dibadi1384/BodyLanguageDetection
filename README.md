## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation & Setup

### Backend Setup

1. Navigate to the Backend directory:
   ```bash
   cd Backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

The backend server will run on a port specified by the environment variable `PORT` if provided. If not provided, the backend will ask the OS for an available port and write the chosen port to `Backend/.backend-port` so other tools (like the frontend dev server) can discover it.

### Frontend Setup

1. Navigate to the Frontend directory:
   ```bash
   cd Frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

The frontend will run on `http://localhost:3000`

### Demo Videos

To test the model with example inputs, you can download all demo video clips here:
`https://drive.google.com/drive/folders/1ovj5GqcfMnLB3oHrqJtHkMqxrixgbc6Z?usp=drive_link`

## Usage

1. **Start both servers** (backend on any available port, frontend on port 3000). The backend's chosen port will be written to `Backend/.backend-port` after it starts.
2. **Open your browser** and go to `http://localhost:3000`
3. **Upload videos** by either:
   - Dragging and dropping video files onto the upload zone
   - Clicking the upload zone to open the file browser
4. **View uploaded videos** in the list below the upload zone
5. **Refresh the list** using the "Refresh" button to see all uploaded videos

## API Endpoints

### Backend API

- `GET /` - Server health check
- `POST /upload` - Upload a video file
- `GET /videos` - Get list of uploaded videos

### Upload Request Format

```
POST /upload
Content-Type: multipart/form-data

Form data:
- video: [File] - The video file to upload
```

### Upload Response Format

```json
{
  "message": "Video uploaded successfully!",
  "file": {
    "filename": "video-1234567890-123456789.mp4",
    "originalName": "my-video.mp4",
    "size": 1048576,
    "mimetype": "video/mp4",
    "uploadedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

## Configuration

### File Size Limit
- Maximum file size: 500MB (configurable in `server.js`)
- Supported formats: MP4, AVI, MOV, WMV, FLV, WebM, MKV

### Server Port
- Backend: Configurable via environment variable `PORT`. If not set, the backend will select an available port and write it to `Backend/.backend-port`.
- Frontend: Port 3000 (React default). The Frontend dev server will attempt to discover the backend port by reading `Backend/.backend-port` or using the `VITE_API_URL` env variable.

## Development

### Backend Development
- Uses Express.js with Multer for file handling
- CORS enabled for frontend communication
- File filtering for video types only
- Automatic uploads directory creation

### Frontend Development
- React with modern hooks (useState, useCallback)
- Axios for HTTP requests
- Responsive CSS with modern styling
- Drag and drop API integration

## Debugging

### Quick Debug Setup

1. **Backend Debugging**:
   ```bash
   cd Backend
   npm run debug        # Start with debugger
   npm run debug:nodemon # Auto-restart debugging
   ```

2. **VS Code Debugging**:
   - Open Backend folder in VS Code
   - Press F5 to start debugging
   - Set breakpoints by clicking line numbers

3. **Chrome DevTools**:
   - Run `npm run debug` in Backend
   - Open `chrome://inspect` in Chrome
   - Click "Open dedicated DevTools for Node"

For detailed debugging instructions, see [DEBUG_GUIDE.md](./DEBUG_GUIDE.md)

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port in `server.js` or kill the process using the port
2. **CORS errors**: Ensure the backend is running and CORS is properly configured
3. **File upload fails**: Check file size limits and supported formats
4. **Frontend won't start**: Run `npm install` in the Frontend directory

### File Upload Issues

- Ensure the file is a valid video format
- Check file size is under 500MB
- Verify the backend server is running
- Check browser console for error messages

## Technologies Used

### Backend
- **Express.js** - Web framework
- **Multer** - File upload middleware
- **CORS** - Cross-origin resource sharing
- **Node.js** - Runtime environment

### Frontend
- **React** - UI library
- **Axios** - HTTP client
- **CSS3** - Styling with modern features
- **HTML5** - Drag and drop API

## License

MIT License - feel free to use this project for your own applications.
