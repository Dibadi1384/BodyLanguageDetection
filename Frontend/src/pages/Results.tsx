import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Download, 
  Clock,
  Target,
  Activity,
  Zap,
  Video,
  Loader2
} from "lucide-react";
import { fetchAnalysisData, type FrontendAnalysisData } from "@/lib/dataMappers";

const Results = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  // Data loading state
  const [analysisData, setAnalysisData] = useState<FrontendAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoStem = searchParams.get("stem");
  const videoTitle = searchParams.get("title");

  // Fetch analysis data on mount
  useEffect(() => {
    const loadData = async () => {
      if (!videoStem) {
        setError("No video specified");
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        // Fetch real analysis data from backend
        const data = await fetchAnalysisData(videoStem);
        
        setAnalysisData(data);
        setError(null);
      } catch (err) {
        console.error("Failed to load analysis data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [videoStem]);

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        // Check if video is ready to play
        if (videoRef.current.readyState >= 2) {
          await videoRef.current.play();
          setIsPlaying(true);
        } else {
          // Wait for video to be ready
          videoRef.current.addEventListener('loadeddata', () => {
            videoRef.current?.play().then(() => setIsPlaying(true)).catch(err => {
              console.error('Error playing video:', err);
              setVideoError('Failed to play video: ' + err.message);
            });
          }, { once: true });
          // Trigger load if not already loading
          if (videoRef.current.readyState === 0) {
            videoRef.current.load();
          }
        }
      } catch (err) {
        console.error('Error playing video:', err);
        setVideoError(err instanceof Error ? err.message : 'Failed to play video');
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };


  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return "text-green-500";
    if (confidence >= 75) return "text-yellow-500";
    return "text-orange-500";
  };

  const getProgressBarColor = (confidence: number) => {
    if (confidence >= 90) return "bg-green-500";
    if (confidence >= 75) return "bg-yellow-500";
    return "bg-orange-500";
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading analysis data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !analysisData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-destructive/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Video className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Failed to Load Analysis</h2>
          <p className="text-muted-foreground mb-6">{error || "No data available"}</p>
          <Button onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="hover:bg-accent"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground mb-1">
              {videoTitle || analysisData.videoTitle}
            </h1>
            <p className="text-muted-foreground">Analysis completed successfully</p>
          </div>
          {analysisData.detectionsUrl && (
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => window.open(analysisData.detectionsUrl, '_blank')}
            >
              <Download className="w-4 h-4" />
              Export Results
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Player Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Player */}
            <Card className="overflow-hidden">
              <CardContent className="p-6">
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  {analysisData.annotatedVideoUrl ? (
                    <>
                      <video 
                        ref={videoRef}
                        src={analysisData.annotatedVideoUrl}
                        onTimeUpdate={handleTimeUpdate}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onLoadedData={() => {
                          setVideoReady(true);
                          setVideoError(null);
                        }}
                        onError={(e) => {
                          const video = e.currentTarget;
                          const error = video.error;
                          let errorMsg = 'Failed to load video';
                          if (error) {
                            switch (error.code) {
                              case error.MEDIA_ERR_ABORTED:
                                errorMsg = 'Video loading aborted';
                                break;
                              case error.MEDIA_ERR_NETWORK:
                                errorMsg = 'Network error loading video';
                                break;
                              case error.MEDIA_ERR_DECODE:
                                errorMsg = 'Video decoding error';
                                break;
                              case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                                errorMsg = 'Video format not supported or source not accessible';
                                break;
                              default:
                                errorMsg = `Video error (code ${error.code})`;
                            }
                          }
                          console.error('[Video Error]', errorMsg, {
                            src: analysisData.annotatedVideoUrl,
                            errorCode: error?.code,
                            networkState: video.networkState,
                            readyState: video.readyState
                          });
                          setVideoError(errorMsg);
                          setVideoReady(false);
                        }}
                        onCanPlay={() => setVideoReady(true)}
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                      {videoError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                          <div className="text-center p-4">
                            <Video className="w-12 h-12 text-destructive mx-auto mb-2" />
                            <p className="text-destructive font-medium">{videoError}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              URL: {analysisData.annotatedVideoUrl}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-4"
                              onClick={() => {
                                setVideoError(null);
                                if (videoRef.current) {
                                  videoRef.current.load();
                                }
                              }}
                            >
                              Retry
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Placeholder when no annotated video is available */
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                      <div className="text-center">
                        <Video className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No annotated video available</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Detection data is shown in the sidebar
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Play/Pause Button Overlay */}
                  <button
                    onClick={togglePlayPause}
                    className="absolute inset-0 flex items-center justify-center group cursor-pointer"
                  >
                    <div className="bg-background/80 backdrop-blur-sm rounded-full p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isPlaying ? (
                        <Pause className="w-8 h-8 text-foreground" />
                      ) : (
                        <Play className="w-8 h-8 text-foreground ml-1" />
                      )}
                    </div>
                  </button>
                </div>

                {/* Video Timeline Scrubber */}
                <div className="mt-4 space-y-2">
                  <Progress value={(currentTime / analysisData.videoDuration) * 100} className="h-2" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{currentTime.toFixed(1)}s</span>
                    <span>{analysisData.videoDuration.toFixed(1)}s</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Analysis Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Analysis Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analysisData.segments && analysisData.segments.length > 0 ? (
                    analysisData.segments.map((segment, index) => (
                      <div key={index} className="flex items-center gap-4">
                        <div className="text-sm text-muted-foreground min-w-[80px] font-mono">
                          {(segment.startTime ?? 0).toFixed(1)}s - {(segment.endTime ?? 0).toFixed(1)}s
                        </div>
                        <div className="flex-1 bg-muted rounded-full h-8 relative overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-purple-600 transition-all"
                            style={{ width: `${Math.min(((segment.detectionCount ?? 0) / 10) * 100, 100)}%` }}
                          />
                          <div className="absolute inset-0 flex items-center px-3">
                            <span className="text-xs font-medium text-foreground drop-shadow-sm">
                              {segment.primaryDetection || 'No detections'}
                            </span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="min-w-[100px] justify-center">
                          {segment.detectionCount ?? 0} detections
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No timeline segments available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Analysis Summary Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-cyan-500" />
                    <span className="text-sm text-muted-foreground">Total Detections</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {analysisData.summary.totalDetections}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-500" />
                    <span className="text-sm text-muted-foreground">Avg Confidence</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {analysisData.summary.avgConfidence}%
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Processing Time</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {analysisData.summary.processingTime}s
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Detected Objects List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detected Objects</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="p-6 pt-0 space-y-3">
                    {(() => {
                      const validDetections = analysisData.detections.filter(
                        (detection) => detection && detection.timestamp != null && detection.confidence != null
                      );
                      
                      if (validDetections.length === 0) {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            <p>No detections found</p>
                            <p className="text-xs mt-2">The analysis completed but no detections were generated.</p>
                          </div>
                        );
                      }
                      
                       return validDetections.map((detection) => (
                         <div
                           key={detection.id}
                           className="w-full text-left p-4 rounded-lg border border-border bg-card"
                         >
                          <div className="flex items-start justify-between mb-3">
                            <span className="font-medium text-foreground">{detection.label || 'Unknown'}</span>
                            <Badge variant="outline" className="text-xs font-mono">
                              {(detection.timestamp ?? 0).toFixed(1)}s
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                              <div 
                                className={`h-full ${getProgressBarColor(detection.confidence ?? 0)} transition-all`}
                                style={{ width: `${detection.confidence ?? 0}%` }}
                              />
                            </div>
                            <span className={`text-sm font-semibold ${getConfidenceColor(detection.confidence ?? 0)}`}>
                              {(detection.confidence ?? 0).toFixed(1)}%
                             </span>
                           </div>
                         </div>
                       ));
                    })()}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;

