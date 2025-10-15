import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import './VideoUpload.css';

const VideoUpload = ({ onVideoUpload }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find(file => file.type.startsWith('video/'));
    
    if (videoFile) {
      uploadVideo(videoFile);
    } else {
      setMessage('Please drop a video file');
    }
  }, []);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      uploadVideo(file);
    }
  }, []);

  const uploadVideo = async (file) => {
    if (!file.type.startsWith('video/')) {
      setMessage('Please select a video file');
      return;
    }

    const formData = new FormData();
    formData.append('video', file);

    try {
      setUploading(true);
      setUploadProgress(0);
      setMessage('');

      const response = await axios.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setMessage('Video uploaded successfully!');
      onVideoUpload(response.data.file);
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
      
    } catch (error) {
      console.error('Upload error:', error);
      if (error.response?.data?.error) {
        setMessage(`Upload failed: ${error.response.data.error}`);
      } else {
        setMessage('Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="video-upload-container">
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        
        {uploading ? (
          <div className="upload-progress">
            <div className="progress-circle">
              <div className="progress-text">{uploadProgress}%</div>
            </div>
            <p>Uploading your video...</p>
          </div>
        ) : (
          <div className="upload-content">
            <div className="upload-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </div>
            <h3>Drop your video here</h3>
            <p>or click to browse files</p>
            <div className="supported-formats">
              <small>Supported: MP4, AVI, MOV, WMV, FLV, WebM, MKV</small>
            </div>
          </div>
        )}
      </div>
      
      {message && (
        <div className={`upload-message ${message.includes('successfully') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default VideoUpload;

