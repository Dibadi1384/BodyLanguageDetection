import React from 'react';
import './VideoList.css';

const VideoList = ({ videos, loading }) => {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="video-list loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading videos...</p>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="video-list empty">
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </div>
          <h3>No videos uploaded yet</h3>
          <p>Upload your first video using the drop zone above</p>
        </div>
      </div>
    );
  }

  return (
    <div className="video-list">
      <div className="video-grid">
        {videos.map((video, index) => (
          <div key={index} className="video-card">
            <div className="video-info">
              <div className="video-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
              </div>
              <div className="video-details">
                <h4 className="video-name">{video.filename || video.originalName}</h4>
                <div className="video-meta">
                  <span className="file-size">{formatFileSize(video.size)}</span>
                  <span className="upload-date">
                    {formatDate(video.uploadedAt || video.uploadedAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="video-status">
              <span className="status-badge success">Uploaded</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoList;

