import { useState, useRef, useEffect, useMemo } from "react";
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
  Users,
  Video,
  Loader2
} from "lucide-react";
import { fetchAnalysisData, type FrontendAnalysisData, type PersonStat } from "@/lib/dataMappers";

const Results = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
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

  // Get people visible at current time (based on frame index)
  const getVisiblePeopleAtTime = (currentTime: number): PersonStat[] => {
    if (!analysisData) return [];
    
    // Calculate the current frame index based on time and FPS
    const fps = analysisData.fps || 30;
    const currentFrameIndex = Math.floor(currentTime * fps);
    
    return analysisData.peopleStats.filter(personStat => {
      // Check if person has detections at or near the current frame
      const frameWindow = 5; // Allow ±5 frames for visibility
      return analysisData.personDetections.some(
        detection => 
          detection.personId === personStat.personId &&
          Math.abs(detection.frameIndex - currentFrameIndex) <= frameWindow
      );
    });
  };

  // Get the detection for a person at the current time (exact frame match, or previous detection for smooth transitions)
  const getPersonDetectionAtTime = (personId: number, currentTime: number) => {
    if (!analysisData) return null;
    
    // Calculate the current frame index based on time and FPS
    const fps = analysisData.fps || 30;
    const currentFrameIndex = Math.floor(currentTime * fps);
    
    // Find detections for this person
    const personDetections = analysisData.personDetections.filter(
      d => d.personId === personId
    );
    
    if (personDetections.length === 0) return null;
    
    // First, try to find an exact frame match
    const exactMatch = personDetections.find(
      d => d.frameIndex === currentFrameIndex
    );
    
    if (exactMatch) return exactMatch;
    
    // If no exact match, find the closest frame index (within a small range)
    // This handles cases where frames might be sampled at intervals
    const frameWindow = 5; // Allow ±5 frames for matching
    const nearbyDetections = personDetections.filter(
      d => Math.abs(d.frameIndex - currentFrameIndex) <= frameWindow
    );
    
    if (nearbyDetections.length > 0) {
      // Find the detection with the smallest frame index difference
      const closest = nearbyDetections.reduce((prev, curr) => 
        Math.abs(curr.frameIndex - currentFrameIndex) < Math.abs(prev.frameIndex - currentFrameIndex) ? curr : prev
      );
      return closest;
    }
    
    // If no nearby detections, use the most recent detection before current time
    // This creates smooth transitions by keeping the previous stat visible
    const earlierDetections = personDetections.filter(
      d => d.frameIndex <= currentFrameIndex
    );
    
    if (earlierDetections.length > 0) {
      // Always use the most recent previous detection (no time limit for smooth transitions)
      const mostRecent = earlierDetections.reduce((prev, curr) => 
        curr.frameIndex > prev.frameIndex ? curr : prev
      );
      return mostRecent;
    }
    
    // If person hasn't been detected yet at this point in time, return null
    return null;
  };
  
  // Get cumulative stats for a person (for frame count display)
  const getPersonCumulativeStats = (personId: number, currentTime: number) => {
    if (!analysisData) return { frameCount: 0, firstSeen: null, lastSeen: null };
    
    const detectionsUpToTime = analysisData.personDetections.filter(
      d => d.personId === personId && d.timestamp <= currentTime
    );
    
    if (detectionsUpToTime.length === 0) {
      return { frameCount: 0, firstSeen: null, lastSeen: null };
    }
    
    const timestamps = detectionsUpToTime.map(d => d.timestamp).sort((a, b) => a - b);
    
    return {
      frameCount: detectionsUpToTime.length,
      firstSeen: timestamps[0] ?? null,
      lastSeen: timestamps[timestamps.length - 1] ?? null,
    };
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

  // Calculate timeline segments for each person (time-based detection segments)
  const personTimelineData = useMemo(() => {
    if (!analysisData) return [];
    
    const fps = analysisData.fps || 30;
    const frameDuration = 1 / fps; // Duration of one frame in seconds
    
    return analysisData.peopleStats.map(personStat => {
      // Get all detections for this person, sorted by timestamp
      const personDetections = analysisData.personDetections
        .filter(d => d.personId === personStat.personId)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      if (personDetections.length === 0) {
        return {
          personId: personStat.personId,
          segments: [],
          totalDuration: 0,
          startTime: 0,
          endTime: 0,
        };
      }
      
      // Create segments by grouping consecutive detections with the same label
      const segments: Array<{
        label: string;
        startTime: number;
        endTime: number;
        duration: number;
        frameCount: number;
      }> = [];
      
      let currentSegment: {
        label: string;
        startTime: number;
        endTime: number;
        frameCount: number;
      } | null = null;
      
      personDetections.forEach((detection, index) => {
        const segmentEndTime = detection.timestamp + frameDuration;
        
        if (!currentSegment || currentSegment.label !== detection.label) {
          // Start a new segment
          if (currentSegment) {
            // Extend previous segment to the start of this new detection
            segments.push({
              label: currentSegment.label,
              startTime: currentSegment.startTime,
              endTime: detection.timestamp, // Extend to start of next detection
              duration: detection.timestamp - currentSegment.startTime,
              frameCount: currentSegment.frameCount,
            });
          }
          
          currentSegment = {
            label: detection.label,
            startTime: detection.timestamp,
            endTime: segmentEndTime,
            frameCount: 1,
          };
        } else {
          // Extend current segment
          currentSegment.endTime = segmentEndTime;
          currentSegment.frameCount += 1;
        }
        
        // If this is the last detection, finalize the segment (will extend to video end in render)
        if (index === personDetections.length - 1 && currentSegment) {
          segments.push({
            label: currentSegment.label,
            startTime: currentSegment.startTime,
            endTime: currentSegment.endTime,
            duration: currentSegment.endTime - currentSegment.startTime,
            frameCount: currentSegment.frameCount,
          });
        }
      });
      
      const startTime = personDetections[0]?.timestamp || 0;
      const endTime = personDetections[personDetections.length - 1]?.timestamp + frameDuration || 0;
      const totalDuration = endTime - startTime;
      const totalFrames = personDetections.length;
      
      return {
        personId: personStat.personId,
        segments,
        totalDuration,
        totalFrames,
        startTime,
        endTime,
      };
    });
  }, [analysisData]);

  // Color mapping for detection types - using purple to blue gradient theme
  const detectionColorMap = useMemo(() => {
    if (!analysisData) return new Map<string, string>();
    
    const colorMap = new Map<string, string>();
    // Purple to blue gradient colors matching the theme
    const COLORS = [
      '#8b5cf6', // purple-500
      '#7c3aed', // purple-600
      '#6d28d9', // purple-700
      '#6366f1', // indigo-500
      '#4f46e5', // indigo-600
      '#3b82f6', // blue-500
      '#2563eb', // blue-600
      '#1d4ed8', // blue-700
      '#06b6d4', // cyan-500
      '#0891b2', // cyan-600
      '#a855f7', // violet-500
      '#9333ea', // violet-600
    ];
    
    // Get all unique labels
    const allLabels = new Set<string>();
    analysisData.personDetections.forEach(d => allLabels.add(d.label));
    
    // Assign colors to labels
    Array.from(allLabels).forEach((label, index) => {
      colorMap.set(label, COLORS[index % COLORS.length]);
    });
    
    return colorMap;
  }, [analysisData]);

  const getDetectionColor = (label: string): string => {
    return detectionColorMap.get(label) || '#8b5cf6'; // default purple
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
                        onLoadedMetadata={() => {
                          if (videoRef.current) {
                            setVideoDuration(videoRef.current.duration || 0);
                          }
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
                  <Progress value={videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0} className="h-2" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{currentTime.toFixed(1)}s</span>
                    <span>{(videoDuration || analysisData.videoDuration).toFixed(1)}s</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Analysis Timeline - Person Detection Timeline Bars */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Analysis Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {personTimelineData.length > 0 ? (
                    personTimelineData.map(({ personId, segments, totalDuration, totalFrames, startTime, endTime }) => {
                      // Use actual video duration for timeline scale
                      const actualVideoDuration = videoDuration || analysisData.videoDuration || 0;
                      
                      // Calculate tick intervals (show ticks every second, or adjust based on duration)
                      const tickInterval = actualVideoDuration > 10 ? 2 : actualVideoDuration > 5 ? 1 : 0.5;
                      const ticks: number[] = [];
                      for (let t = 0; t <= actualVideoDuration; t += tickInterval) {
                        ticks.push(t);
                      }
                      
                      return (
                        <div key={personId} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-foreground">
                              Person {personId}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                              {totalFrames} frame{totalFrames !== 1 ? 's' : ''} detected
                            </Badge>
                          </div>
                          {segments.length > 0 ? (
                            <div className="space-y-2">
                              {/* Timeline Bar with ticks */}
                              <div className="relative w-full">
                                <div className="relative w-full h-6 bg-muted rounded-lg overflow-hidden">
                                  {segments.map((segment, index) => {
                                    // Extend each segment: if not the last, extend to next segment start; if last, extend to video end
                                    let extendedEndTime = segment.endTime;
                                    if (index < segments.length - 1) {
                                      // Extend to start of next segment
                                      extendedEndTime = segments[index + 1].startTime;
                                    } else if (actualVideoDuration > 0) {
                                      // Last segment extends to end of video
                                      extendedEndTime = actualVideoDuration;
                                    }
                                    
                                    const extendedDuration = extendedEndTime - segment.startTime;
                                    const segmentWidth = actualVideoDuration > 0 
                                      ? (extendedDuration / actualVideoDuration) * 100 
                                      : 0;
                                    const segmentLeft = actualVideoDuration > 0
                                      ? (segment.startTime / actualVideoDuration) * 100
                                      : 0;
                                    
                                    return (
                                      <div
                                        key={index}
                                        className="absolute h-full cursor-pointer transition-opacity hover:opacity-90"
                                        style={{
                                          left: `${segmentLeft}%`,
                                          width: `${segmentWidth}%`,
                                          backgroundColor: getDetectionColor(segment.label),
                                        }}
                                        title={`${segment.label}: ${segment.startTime.toFixed(1)}s - ${extendedEndTime.toFixed(1)}s (${segment.frameCount} frames)`}
                                      />
                                    );
                                  })}
                                </div>
                                {/* Timeline ticks */}
                                <div className="relative w-full h-3 mt-1 mb-4">
                                  {ticks.map((tickTime, index) => {
                                    const tickPosition = actualVideoDuration > 0
                                      ? (tickTime / actualVideoDuration) * 100
                                      : 0;
                                    
                                    return (
                                      <div
                                        key={index}
                                        className="absolute top-0 flex flex-col items-center"
                                        style={{ left: `${tickPosition}%`, transform: 'translateX(-50%)' }}
                                      >
                                        <div className="w-px h-2 bg-border" />
                                        <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                          {tickTime.toFixed(tickInterval < 1 ? 1 : 0)}s
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              
                              {/* Legend */}
                              <div className="flex flex-wrap gap-2 text-xs mt-6">
                                {Array.from(new Set(segments.map(s => s.label))).map((label) => (
                                  <div key={label} className="flex items-center gap-1.5">
                                    <div
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: getDetectionColor(label) }}
                                    />
                                    <span className="text-muted-foreground">{label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              No detections available for this person
                            </div>
                          )}
                          {personTimelineData.length > 1 && personId !== personTimelineData[personTimelineData.length - 1].personId && (
                            <Separator className="mt-4" />
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No person detection data available
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
                    <Users className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Total People Detected</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {analysisData.summary.totalPeopleDetected}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Detected People List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detected People</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="p-6 pt-0 space-y-3">
                    {(() => {
                      if (analysisData.peopleStats.length === 0) {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            <p>No people detected</p>
                            <p className="text-xs mt-2">The analysis completed but no people were detected.</p>
                          </div>
                        );
                      }
                      
                      // Show all people with their current frame stats
                      return analysisData.peopleStats.map((personStat) => {
                        const currentDetection = getPersonDetectionAtTime(personStat.personId, currentTime);
                        const cumulativeStats = getPersonCumulativeStats(personStat.personId, currentTime);
                        
                        // Use current frame detection if available
                        // If no detection at current frame, it will use the previous detection (handled in getPersonDetectionAtTime)
                        const currentAction = currentDetection?.label || 'Not detected yet';
                        const currentConfidence = currentDetection?.confidence ?? 0;
                        
                        return (
                          <div
                            key={personStat.personId}
                            className="w-full text-left p-4 rounded-lg border border-primary bg-primary/5"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  Person {personStat.personId}
                                </span>
                              </div>
                              <Badge variant="outline" className="text-xs font-mono">
                                {cumulativeStats.frameCount} frames
                              </Badge>
                            </div>
                            
                            <div className="space-y-2">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">Action</span>
                                  <span className="text-xs font-medium text-foreground">
                                    {currentAction}
                                  </span>
                                </div>
                              </div>
                              
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">Confidence</span>
                                  <span className={`text-xs font-semibold ${getConfidenceColor(currentConfidence)}`}>
                                    {currentConfidence.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${getProgressBarColor(currentConfidence)} transition-all duration-300 ease-in-out`}
                                    style={{ width: `${currentConfidence}%` }}
                                  />
                                </div>
                              </div>
                              
                              {currentDetection && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Frame Time:</span>
                                  <span className="font-mono">
                                    {currentDetection.timestamp.toFixed(1)}s
                                  </span>
                                </div>
                              )}
                              
                              {cumulativeStats.firstSeen !== null && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Time Range:</span>
                                  <span className="font-mono">
                                    {cumulativeStats.firstSeen.toFixed(1)}s - {cumulativeStats.lastSeen !== null ? cumulativeStats.lastSeen.toFixed(1) + 's' : 'current'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
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

