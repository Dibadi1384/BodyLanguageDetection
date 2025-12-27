import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { VideoUploadZone } from "@/components/VideoUploadZone";
import { UploadProgress } from "@/components/UploadProgress";
import { VideoCard } from "@/components/VideoCard";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Video, Folder } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UploadingFile {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "processing" | "completed";
}

interface UploadedVideo {
  id: string;
  title: string;
  uploadDate: string;
  status: "processing" | "completed" | "analyzing";
  annotatedUrl?: string;
  detectionsUrl?: string;
  stem?: string;
  statusMessage?: string;
  description?: string;
}

// Helper function to format status message from status object (returns base message without dots)
const formatStatusMessage = (status: any): string => {
  if (!status) return "Processing";
  
  // The status object from backend has details containing the actual statusInfo
  const details = status.details || {};
  const stage = details.stage !== undefined ? details.stage : status.stage;
  const action = details.action || status.action || "";
  const statusType = details.status || status.status || "";
  
  // Stage 0: Refining prompt
  if (stage === 0 || statusType === 'refining_prompt') {
    return "Refining detection prompt";
  }
  
  // Stage 1: Extracting frames
  if (stage === 1 || statusType === 'extracting_frames') {
    const framesExtracted = details.framesExtracted !== undefined ? details.framesExtracted : (status.framesExtracted !== undefined ? status.framesExtracted : null);
    if (framesExtracted !== null && framesExtracted !== undefined) {
      return `Extracting frames: ${framesExtracted} frames`;
    }
    return "Extracting video frames";
  }
  
  // Stage 2: Analyzing frames (Detection)
  if (stage === 2 || statusType === 'analyzing_frames') {
    // Check for batch progress information
    const currentBatch = details.currentBatch !== undefined ? details.currentBatch : (status.currentBatch !== undefined ? status.currentBatch : null);
    const totalBatches = details.totalBatches !== undefined ? details.totalBatches : (status.totalBatches !== undefined ? status.totalBatches : null);
    const batchPercentage = details.batchPercentage !== undefined ? details.batchPercentage : (status.batchPercentage !== undefined ? status.batchPercentage : null);
    const framesExtracted = details.framesExtracted !== undefined ? details.framesExtracted : (status.framesExtracted !== undefined ? status.framesExtracted : null);
    
    // If we have batch information, show batch progress
    if (currentBatch !== null && totalBatches !== null && totalBatches > 0) {
      const percentage = batchPercentage !== null ? batchPercentage : Math.round((currentBatch / totalBatches) * 100);
      return `Detection Progress Batch ${currentBatch}/${totalBatches}`;
    }
    
    // Fallback to frame-based progress
    const framesAnalyzed = details.framesAnalyzed !== undefined ? details.framesAnalyzed : (status.framesAnalyzed !== undefined ? status.framesAnalyzed : null);
    
    if (framesAnalyzed !== null && framesAnalyzed !== undefined && framesExtracted !== null && framesExtracted !== undefined) {
      const percentage = Math.min(100, Math.round((framesAnalyzed / framesExtracted) * 100));
      return `Detection ${percentage}%`;
    } else if (framesAnalyzed !== null && framesAnalyzed !== undefined) {
      return `Detection: ${framesAnalyzed} frames`;
    }
    return "Detection in progress";
  }
  
  // Stage 3: Annotating video
  if (stage === 3 || statusType === 'annotating_video') {
    // Check for progress information from backend (frameIdx, totalFrames, percentage)
    const frameIdx = details.frameIdx !== undefined ? details.frameIdx : (status.frameIdx !== undefined ? status.frameIdx : null);
    const totalFrames = details.totalFrames !== undefined ? details.totalFrames : (status.totalFrames !== undefined ? status.totalFrames : null);
    const percentage = details.percentage !== undefined ? details.percentage : (status.percentage !== undefined ? status.percentage : null);
    
    if (percentage !== null && percentage !== undefined) {
      // Use actual percentage from backend progress
      return `Annotating Video Frames ${Math.round(percentage)}%`;
    } else if (frameIdx !== null && totalFrames !== null && totalFrames !== undefined) {
      // Calculate percentage from frame counts
      const calcPercentage = Math.min(100, Math.round((frameIdx / totalFrames) * 100));
      return `Annotating Video Frames ${calcPercentage}%`;
    } else if (action.includes('completed')) {
      return `Annotating Video Frames 100%`;
    }
    return "Annotating video frames";
  }
  
  // Fallback to action or status
  return action || statusType || "Processing";
};

const Index = () => {
  const navigate = useNavigate();
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [detectionDescription, setDetectionDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [improvedText, setImprovedText] = useState<string | null>(null);
  const [navigatedVideos, setNavigatedVideos] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string>("emotion"); // Default to emotion

  // Note: We don't load all videos on mount anymore since we only show processing videos
  // The My Detections page will handle showing all completed videos

  // Load selected key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('detection_key');
    if (savedKey && ['emotion', 'action', 'pose', 'expression'].includes(savedKey)) {
      setSelectedKey(savedKey);
    }
  }, []);

  const handleUpload = (files: File[]) => {
    files.forEach((file) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newUpload: UploadingFile = {
        id,
        fileName: file.name,
        progress: 0,
        status: "uploading",
      };

      setUploadingFiles((prev) => [...prev, newUpload]);
      toast.success(`Started uploading ${file.name}`);

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('video', file);
      
      // Send original user input (before refinement) for filename generation
      if (detectionDescription && detectionDescription.trim()) {
        formData.append('userInput', detectionDescription.trim());
        console.log('[FRONTEND DEBUG] Sending original user input for filename:', detectionDescription.trim());
      }
      
      // Send refined prompt if available (already refined through NLP endpoint)
      if (improvedText) {
        formData.append('refinedPrompt', improvedText);
        console.log('[FRONTEND DEBUG] Sending refined prompt with video upload:', improvedText);
      } else {
        console.log('[FRONTEND DEBUG] No refined prompt available - video will use default prompt');
      }
      
      // Send selected detection key
      formData.append('detectionKey', selectedKey);
      console.log('[FRONTEND DEBUG] Sending detection key:', selectedKey);

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadingFiles((prev) =>
            prev.map((upload) =>
              upload.id === id
                ? { ...upload, progress, status: "uploading" }
                : upload
            )
          );
        }
      });

      // Handle successful upload
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            console.log('Upload successful:', response);

            // Update status to processing
            setUploadingFiles((prev) =>
              prev.map((upload) =>
                upload.id === id
                  ? { ...upload, progress: 100, status: "processing" }
                  : upload
              )
            );

            // Begin status polling using the uploaded file stem
            const uploadedFilename: string = response?.file?.filename || file.name;
            const stem = uploadedFilename.replace(/\.[^/.]+$/, "");

            // Use detectionDescription (original user input) as title, otherwise use filename
            const videoTitle = detectionDescription || file.name.replace(/\.[^/.]+$/, "");
            
            // Store description in localStorage keyed by stem for use in My Detections
            if (videoTitle) {
              localStorage.setItem(`video_desc_${stem}`, videoTitle);
            }
            
            const newVideo: UploadedVideo = {
              id,
              title: videoTitle,
              uploadDate: new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              status: "analyzing",
              stem,
              statusMessage: "Processing",
              description: videoTitle,
            };
            setUploadedVideos((prev) => [newVideo, ...prev]);
            setUploadingFiles((prev) => prev.filter((upload) => upload.id !== id));
            toast.success("Video uploaded. Analysis started...");

            const interval = setInterval(async () => {
              try {
                const resp = await fetch(`/status/${encodeURIComponent(stem)}`);
                if (!resp.ok) {
                  // If not found, keep waiting briefly
                  if (resp.status === 404) return;
                  throw new Error(`Status ${resp.status}`);
                }
                const status = await resp.json();

                if (status.status === 'completed' || status.status === 'failed') {
                  clearInterval(interval);

                  // Map backend paths to frontend URLs
                  // Prefer absolute backend base if provided via Vite env
                  const apiBase = ((import.meta as any).env?.VITE_API_URL as string) || '';
                  const toPublicUrl = (p?: string) => {
                    if (!p) return undefined;
                    // Normalize separators
                    const norm = p.replace(/\\/g, '/');
                    const uploadsIdx = norm.indexOf('/Backend/uploads/');
                    const workIdx = norm.indexOf('/Backend/work/');
                    if (uploadsIdx !== -1) {
                      const sub = norm.substring(uploadsIdx + '/Backend/uploads/'.length);
                      return apiBase ? `${apiBase.replace(/\/$/, '')}/uploads/${sub}` : `/uploads/${sub}`;
                    }
                    if (workIdx !== -1) {
                      const sub = norm.substring(workIdx + '/Backend/work/'.length);
                      return apiBase ? `${apiBase.replace(/\/$/, '')}/work/${sub}` : `/work/${sub}`;
                    }
                    // Fallback: if already relative
                      if (norm.startsWith('/uploads/') || norm.startsWith('/work/')) return norm;
                    return undefined;
                  };

                  // Only surface detections JSON in the UI for now
                  const annotatedUrl = undefined;
                  const detectionsUrl = toPublicUrl(status.detectionsPath);

                  if (status.status === 'completed') {
                    toast.success('Analysis completed!');
                    
                    // Remove completed video from processing list
                    setUploadedVideos((prev) => prev.filter((v) => v.id !== id));
                    
                    // Auto-navigate to results page
                    if (stem && !navigatedVideos.has(id)) {
                      // Get the stored description or use filename as fallback
                      const storedDesc = localStorage.getItem(`video_desc_${stem}`);
                      const videoTitle = storedDesc || file.name.replace(/\.[^/.]+$/, "");
                      setNavigatedVideos((prev) => new Set(prev).add(id));
                      
                      // Small delay to ensure state updates are processed
                      setTimeout(() => {
                        navigate(`/results?stem=${encodeURIComponent(stem)}&title=${encodeURIComponent(videoTitle)}`);
                      }, 500);
                    }
                  } else if (status.status === 'failed') {
                    // Keep failed videos in the list but update their status
                    setUploadedVideos((prev) => prev.map((v) => (
                      v.id === id
                        ? {
                            ...v,
                            status: 'processing',
                            detectionsUrl,
                            statusMessage: status.error || 'Analysis failed',
                          }
                        : v
                    )));
                    toast.error(status.error || 'Analysis failed');
                  }
                }
                else {
                  // For running, queued, or any other status, format and update the message
                  const statusMsg = formatStatusMessage(status);
                  setUploadedVideos((prev) => prev.map((v) => (
                    v.id === id
                      ? { 
                          ...v, 
                          status: status.status === 'running' ? 'analyzing' : (status.status === 'queued' ? 'processing' : v.status), 
                          statusMessage: statusMsg 
                        }
                      : v
                  )));
                }
              } catch (e) {
                console.error('Polling error:', e);
              }
            }, 1500);
          } catch (error) {
            console.error('Error parsing upload response:', error);
            toast.error("Upload completed but response parsing failed");
          }
        } else {
          console.error('Upload failed:', xhr.status, xhr.responseText);
          toast.error(`Upload failed: ${xhr.statusText}`);
          setUploadingFiles((prev) => prev.filter((upload) => upload.id !== id));
        }
      });

      // Handle upload errors
      xhr.addEventListener('error', () => {
        console.error('Upload error:', xhr.statusText);
        toast.error("Upload failed due to network error");
        setUploadingFiles((prev) => prev.filter((upload) => upload.id !== id));
      });

      // Handle upload timeout
      xhr.addEventListener('timeout', () => {
        console.error('Upload timeout');
        toast.error("Upload timed out");
        setUploadingFiles((prev) => prev.filter((upload) => upload.id !== id));
      });

      // Configure and send the request
      xhr.open('POST', '/upload', true);
      xhr.timeout = 300000; // 5 minutes timeout for large files
      xhr.send(formData);
    });
  };

  // Removed handleRefresh - we no longer fetch all videos on the main page
  // Only videos that are actively being processed are shown here
  // Completed videos are shown in the My Detections page

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <AnimatedBackground />
      <div className="container mx-auto px-4 py-12 max-w-7xl relative z-10">
        {/* Header */}
        <div className="text-center mb-12 relative z-20">
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent animate-in" style={{ backgroundSize: "200% auto", animation: "gradient 3s linear infinite" }}>
            Body Language Detection
          </h1>
        </div>

        {/* Detection Description */}
        <div className="mb-8 max-w-4xl mx-auto w-full">
          <label htmlFor="detection-description" className="block text-sm font-medium text-foreground mb-2">
            What would you like to detect?
          </label>
          <div className="flex gap-4 items-center mb-4 w-full">
            <Input
              id="detection-description"
              placeholder="Specify the body language, gestures, or behaviors you want to analyze."
              value={detectionDescription}
              onChange={(e) => setDetectionDescription(e.target.value)}
              className="flex-1 w-full"
            />
          </div>
          <div className="flex gap-3 items-center w-full">
            <div className="flex gap-2 flex-1">
              <Button
                variant={selectedKey === "emotion" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedKey("emotion")}
                className={`${selectedKey === "emotion" ? "" : "hover:border-primary hover:bg-transparent hover:text-foreground"} flex-1`}
              >
                Emotion
              </Button>
              <Button
                variant={selectedKey === "action" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedKey("action")}
                className={`${selectedKey === "action" ? "" : "hover:border-primary hover:bg-transparent hover:text-foreground"} flex-1`}
              >
                Action
              </Button>
              <Button
                variant={selectedKey === "pose" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedKey("pose")}
                className={`${selectedKey === "pose" ? "" : "hover:border-primary hover:bg-transparent hover:text-foreground"} flex-1`}
              >
                Pose
              </Button>
              <Button
                variant={selectedKey === "expression" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedKey("expression")}
                className={`${selectedKey === "expression" ? "" : "hover:border-primary hover:bg-transparent hover:text-foreground"} flex-1`}
              >
                Expression
              </Button>
            </div>
            <Button
              onClick={async () => {
                if (!detectionDescription.trim()) {
                  toast.error("Please describe what you want to detect");
                  return;
                }

                setIsSaving(true);
                setImprovedText(null);

                // Save selected key to localStorage immediately when save is pressed
                localStorage.setItem('detection_key', selectedKey);

                // Prefer Vite env variable. If not set, use a relative `/api` path so
                // the Vite dev server proxy can forward requests to the backend.
                const viteApi = ((import.meta as any).env?.VITE_API_URL as string) || '';
                const apiUrl = viteApi ? `${viteApi.replace(/\/$/, '')}/api/nlp` : '/api/nlp';

                try {
                  const resp = await fetch(apiUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: detectionDescription }),
                  });

                  if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || `Server responded ${resp.status}`);
                  }

                  const data = await resp.json();
                  if (data && data.improved) {
                    setImprovedText(data.improved.trim());
                    toast.success("Detection preferences saved and rewritten text received!");
                  } else {
                    throw new Error("Invalid response from NLP API");
                  }
                } catch (e: any) {
                  console.error("NLP request failed:", e);
                  toast.error(e.message || "Failed to save detection settings");
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={isSaving}
              className="bg-gradient-to-br from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white flex-1 shadow-lg"
            >
              {isSaving ? "Saving..." : "Save Detection Settings"}
            </Button>
          </div>
        </div>

        {/* Rewritten / improved text from NLP API */}
        {improvedText && (
          <div className="mb-8 max-w-4xl mx-auto w-full">
            <h4 className="text-sm font-medium text-foreground mb-2">Detection Settings</h4>
            <div className="bg-card rounded-md p-4 border border-border text-foreground w-full">
              {improvedText}
            </div>
          </div>
        )}

        {/* Upload Zone */}
        <div className="mb-12">
          <div className="flex justify-center items-stretch gap-6 max-w-4xl mx-auto">
            <div className="flex-1">
              <VideoUploadZone onUpload={handleUpload} />
            </div>
            <div
              onClick={() => navigate("/detections")}
              className={cn(
                "relative rounded-2xl border-2 border-dashed transition-all duration-300",
                "bg-gradient-to-br from-card to-secondary/30",
                "hover:shadow-lg hover:scale-[1.01] hover:border-primary",
                "flex-1 cursor-pointer",
                "border-border"
              )}
            >
              <div className="flex flex-col items-center justify-center px-6 py-12">
                <div className="mb-4 p-5 rounded-full transition-all duration-300 bg-gradient-to-br from-primary to-accent shadow-lg">
                  <Folder className="w-10 h-10 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">
                  My Detections
                </h3>
                <p className="text-muted-foreground mb-2 text-center max-w-xs text-sm">
                  View your completed video analyses
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {uploadingFiles.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-foreground">
              Uploading
            </h2>
            <div className="space-y-4">
              {uploadingFiles.map((file) => (
                <UploadProgress
                  key={file.id}
                  fileName={file.fileName}
                  progress={file.progress}
                  status={file.status}
                />
              ))}
            </div>
          </div>
        )}

        {/* Processing Videos */}
        {(() => {
          // Filter to only show videos that are still processing
          const processingVideos = uploadedVideos.filter(
            (video) => video.status === "processing" || video.status === "analyzing"
          );

          return (
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-foreground">
                  Processing Videos
                </h2>
              </div>

              {processingVideos.length === 0 ? (
                <div className="bg-card rounded-xl p-12 text-center border border-border shadow-md">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                    <Video className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">
                    No videos processing
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Upload a video to start processing, or check My Detections for completed videos
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {processingVideos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default Index;