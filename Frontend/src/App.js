import React, { useState, useCallback } from 'react';
import './App.css';
import VideoUpload from './components/VideoUpload';
import VideoList from './components/VideoList';

function App() {
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleVideoUpload = useCallback((uploadedVideo) => {
    setUploadedVideos(prev => [uploadedVideo, ...prev]);
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/videos');
      const data = await response.json();
      setUploadedVideos(data.videos || []);
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Video Upload Center</h1>
        <p>Drag and drop your video files or click to select</p>
      </header>
      
      <main className="App-main">
        <VideoUpload onVideoUpload={handleVideoUpload} />
        
        <div className="video-section">
          <div className="section-header">
            <h2>Uploaded Videos</h2>
            <button 
              className="refresh-btn" 
              onClick={fetchVideos}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <VideoList videos={uploadedVideos} loading={loading} />
        </div>
      </main>
    </div>
  );
}

export default App;

