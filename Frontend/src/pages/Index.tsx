import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { VideoUploadZone } from "@/components/VideoUploadZone";
import { UploadProgress } from "@/components/UploadProgress";
import { VideoCard } from "@/components/VideoCard";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";

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
}

const Index = () => {
  const navigate = useNavigate();
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [detectionDescription, setDetectionDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [improvedText, setImprovedText] = useState<string | null>(null);
  const [navigatedVideos, setNavigatedVideos] = useState<Set<string>>(new Set());

  // Load videos from backend on component mount
  useEffect(() => {
    handleRefresh();
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
      
      // Send refined prompt if available (already refined through NLP endpoint)
      if (improvedText) {
        formData.append('refinedPrompt', improvedText);
        console.log('[FRONTEND DEBUG] Sending refined prompt with video upload:', improvedText);
      } else {
        console.log('[FRONTEND DEBUG] No refined prompt available - video will use default prompt');
      }

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

            const newVideo: UploadedVideo = {
              id,
              title: file.name.replace(/\.[^/.]+$/, ""),
              uploadDate: new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              status: "analyzing",
              stem,
              statusMessage: "Starting analysis...",
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

                  setUploadedVideos((prev) => prev.map((v) => (
                    v.id === id
                      ? {
                          ...v,
                          status: status.status === 'completed' ? 'completed' : 'processing',
                          detectionsUrl,
                          statusMessage: status.status === 'completed' ? 'Completed' : (status.error || 'Analysis failed'),
                        }
                      : v
                  )));

                  if (status.status === 'completed') {
                    toast.success('Analysis completed!');
                    
                    // Auto-navigate to results page
                    if (stem && !navigatedVideos.has(id)) {
                      const videoTitle = file.name.replace(/\.[^/.]+$/, "");
                      setNavigatedVideos((prev) => new Set(prev).add(id));
                      
                      // Small delay to ensure state updates are processed
                      setTimeout(() => {
                        navigate(`/results?stem=${encodeURIComponent(stem)}&title=${encodeURIComponent(videoTitle)}`);
                      }, 500);
                    }
                  } else {
                    toast.error(status.error || 'Analysis failed');
                  }
                }
                else if (status.status === 'running' || status.status === 'queued') {
                  setUploadedVideos((prev) => prev.map((v) => (
                    v.id === id
                      ? { ...v, status: status.status === 'running' ? 'analyzing' : 'processing', statusMessage: status.status }
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

  const handleRefresh = async () => {
    toast.info("Refreshing videos...");
    try {
      const response = await fetch('/videos');
      if (!response.ok) {
        throw new Error(`Failed to fetch videos: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Fetched videos:', data);
      
      // Convert backend video data to frontend format
      const backendVideos: UploadedVideo[] = data.videos.map((video: any) => ({
        id: video.filename,
        title: video.filename.replace(/\.[^/.]+$/, ""),
        uploadDate: new Date(video.uploadedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        status: "completed" as const,
        // These are raw uploads. Annotated assets are discovered via status polling on new uploads.
      }));
      
      setUploadedVideos(backendVideos);
      toast.success(`Loaded ${backendVideos.length} videos from server`);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error("Failed to refresh videos from server");
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <AnimatedBackground />
      <div className="container mx-auto px-4 py-12 max-w-7xl relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-accent to-primary shadow-lg shadow-primary/30">
              <Video className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent animate-in" style={{ backgroundSize: "200% auto", animation: "gradient 3s linear infinite" }}>
            Video Upload Center
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Upload your videos for AI-powered analysis. Our advanced models will
            generate action tasks and analyze body language.
          </p>
        </div>

        {/* Detection Description */}
        <div className="mb-8 max-w-3xl mx-auto">
          <label htmlFor="detection-description" className="block text-sm font-medium text-foreground mb-2">
            What would you like to detect?
          </label>
          <div className="space-y-4">
            <Textarea
              id="detection-description"
              placeholder="Specify the body language, gestures, or behaviors you want to analyze. For example: 'Detect hand gestures and facial expressions during presentations', 'Identify posture changes and body positioning', 'Track eye contact patterns and head movements'..."
              value={detectionDescription}
              onChange={(e) => setDetectionDescription(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  if (!detectionDescription.trim()) {
                    toast.error("Please describe what you want to detect");
                    return;
                  }

                  setIsSaving(true);
                  setImprovedText(null);

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
                className="gap-2"
                disabled={isSaving}
              >
                <Video className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Detection Settings"}
              </Button>
            </div>
          </div>
        </div>

        {/* Rewritten / improved text from NLP API */}
        {improvedText && (
          <div className="max-w-3xl mx-auto mb-8">
            <h4 className="text-sm font-medium text-foreground mb-2">Rewritten prompt</h4>
            <div className="bg-card rounded-md p-4 border border-border text-foreground">
              {improvedText}
            </div>
          </div>
        )}

        {/* Upload Zone */}
        <div className="mb-12">
          <VideoUploadZone onUpload={handleUpload} />
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

        {/* Uploaded Videos */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Uploaded Videos
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          {uploadedVideos.length === 0 ? (
            <div className="bg-card rounded-xl p-12 text-center border border-border shadow-md">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Video className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">
                No videos yet
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Upload your first video to get started with AI-powered analysis
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {uploadedVideos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;