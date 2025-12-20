/**
 * Data mappers for transforming backend API responses to frontend format
 */

// Get API base URL from environment or use relative path for proxy
const getApiBase = () => {
  const viteApi = ((import.meta as any).env?.VITE_API_URL as string) || '';
  return viteApi ? viteApi.replace(/\/$/, '') : '';
};

// Convert backend paths to public URLs
const toPublicUrl = (p?: string | null): string | undefined => {
  if (!p) return undefined;
  const apiBase = getApiBase();
  const norm = p.replace(/\\/g, '/');
  
  const uploadsIdx = norm.indexOf('/Backend/uploads/');
  const workIdx = norm.indexOf('/Backend/work/');
  
  if (uploadsIdx !== -1) {
    const sub = norm.substring(uploadsIdx + '/Backend/uploads/'.length);
    return apiBase ? `${apiBase}/uploads/${sub}` : `/uploads/${sub}`;
  }
  if (workIdx !== -1) {
    const sub = norm.substring(workIdx + '/Backend/work/'.length);
    return apiBase ? `${apiBase}/work/${sub}` : `/work/${sub}`;
  }
  
  // Already relative
  if (norm.startsWith('/uploads/') || norm.startsWith('/work/')) return norm;
  return undefined;
};

// Backend detection format
interface BackendBoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

interface BackendPerson {
  person_id: number;
  bbox: BackendBoundingBox;
  bbox_confidence: number;
  analysis_result: Record<string, any>;
  visual_description: string;
}

interface BackendFrameDetection {
  frame_index: number;
  frame_filename: string;
  timestamp_s: number;
  image_width: number;
  image_height: number;
  people_detected: number;
  people: BackendPerson[];
}

interface BackendDetectionsData {
  video_info: {
    video_path: string;
    video_stem: string;
    fps: number;
    total_frames: number;
  };
  task_description: string;
  frame_detections: BackendFrameDetection[];
}

interface BackendStatusData {
  status: string;
  videoPath?: string;
  detectionsPath?: string | null;
  annotatedVideoPath?: string | null;
  taskDescription?: string;
  refinedTask?: string;
  error?: string;
  createdAt?: string;
  completedAt?: string;
}

// Frontend data format expected by Results.tsx
export interface Detection {
  id: string;
  timestamp: number;
  label: string;
  confidence: number;
  duration: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface Segment {
  startTime: number;
  endTime: number;
  primaryDetection: string;
  detectionCount: number;
}

export interface AnalysisSummary {
  totalDetections: number;
  avgConfidence: number;
  processingTime: number;
}

export interface FrontendAnalysisData {
  videoTitle: string;
  videoDuration: number;
  videoWidth: number;
  videoHeight: number;
  annotatedVideoUrl?: string;
  detectionsUrl?: string;
  detections: Detection[];
  segments: Segment[];
  summary: AnalysisSummary;
}

/**
 * Fetch and transform analysis data from backend
 */
export async function fetchAnalysisData(videoStem: string): Promise<FrontendAnalysisData> {
  const apiBase = getApiBase();
  
  // First, fetch the status to get paths
  const statusUrl = apiBase ? `${apiBase}/status/${encodeURIComponent(videoStem)}` : `/status/${encodeURIComponent(videoStem)}`;
  const statusResp = await fetch(statusUrl);
  
  if (!statusResp.ok) {
    throw new Error(`Failed to fetch status: ${statusResp.statusText}`);
  }
  
  const statusData: BackendStatusData = await statusResp.json();
  
  if (statusData.status !== 'completed') {
    throw new Error(`Analysis not completed. Status: ${statusData.status}`);
  }
  
  // Get the public URLs
  const detectionsUrl = toPublicUrl(statusData.detectionsPath);
  const annotatedVideoUrl = toPublicUrl(statusData.annotatedVideoPath);
  
  // Fetch the detections JSON
  if (!detectionsUrl) {
    throw new Error('No detections data available');
  }
  
  const detectionsResp = await fetch(detectionsUrl);
  if (!detectionsResp.ok) {
    throw new Error(`Failed to fetch detections: ${detectionsResp.statusText}`);
  }
  
  const detectionsData: BackendDetectionsData = await detectionsResp.json();
  
  // Transform to frontend format
  return transformDetectionsData(detectionsData, annotatedVideoUrl, detectionsUrl, videoStem);
}

/**
 * Transform backend detections to frontend format
 */
function transformDetectionsData(
  data: BackendDetectionsData,
  annotatedVideoUrl?: string,
  detectionsUrl?: string,
  videoStem?: string
): FrontendAnalysisData {
  const frameDetections = data.frame_detections || [];
  
  // Get video dimensions from first frame detection
  const firstFrame = frameDetections[0];
  const videoWidth = firstFrame?.image_width || 1920;
  const videoHeight = firstFrame?.image_height || 1080;
  
  // Calculate duration from last frame timestamp + estimated frame duration
  const lastFrame = frameDetections[frameDetections.length - 1];
  const fps = data.video_info?.fps || 30;
  const videoDuration = lastFrame ? lastFrame.timestamp_s + (1 / fps) : 0;
  
  // Transform detections
  const detections: Detection[] = [];
  let detectionId = 0;
  
  for (const frame of frameDetections) {
    for (const person of frame.people) {
      // Extract primary label from analysis_result
      const analysisResult = person.analysis_result || {};
      const label = extractLabel(analysisResult) || `Person ${person.person_id}`;
      const confidence = (person.bbox_confidence || 0) * 100;
      
      detections.push({
        id: `detection-${detectionId++}`,
        timestamp: frame.timestamp_s,
        label,
        confidence,
        duration: 1 / fps, // Duration until next frame
        boundingBox: {
          x: person.bbox.x_min,
          y: person.bbox.y_min,
          width: person.bbox.x_max - person.bbox.x_min,
          height: person.bbox.y_max - person.bbox.y_min,
        },
      });
    }
  }
  
  // Generate segments from frame detections
  const segments: Segment[] = generateSegments(frameDetections, fps);
  
  // Calculate summary
  const totalDetections = detections.length;
  const avgConfidence = totalDetections > 0
    ? Math.round(detections.reduce((sum, d) => sum + d.confidence, 0) / totalDetections)
    : 0;
  
  return {
    videoTitle: videoStem || data.video_info?.video_stem || 'Video Analysis',
    videoDuration,
    videoWidth,
    videoHeight,
    annotatedVideoUrl,
    detectionsUrl,
    detections,
    segments,
    summary: {
      totalDetections,
      avgConfidence,
      processingTime: 0, // Could be calculated from status timestamps if needed
    },
  };
}

/**
 * Extract a human-readable label from analysis_result
 */
function extractLabel(analysisResult: Record<string, any>): string {
  // Look for common fields in analysis_result
  if (analysisResult.emotion) {
    return `Emotion: ${analysisResult.emotion}`;
  }
  if (analysisResult.action) {
    return `Action: ${analysisResult.action}`;
  }
  if (analysisResult.pose) {
    return `Pose: ${analysisResult.pose}`;
  }
  if (analysisResult.expression) {
    return `Expression: ${analysisResult.expression}`;
  }
  
  // Try to find any key with a string value
  for (const [key, value] of Object.entries(analysisResult)) {
    if (typeof value === 'string' && key !== 'confidence') {
      return `${capitalize(key)}: ${value}`;
    }
  }
  
  return 'Person Detected';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

/**
 * Generate time-based segments from frame detections
 */
function generateSegments(frameDetections: BackendFrameDetection[], fps: number): Segment[] {
  if (frameDetections.length === 0) return [];
  
  const segments: Segment[] = [];
  const segmentDuration = 5; // Group into 5-second segments
  
  let currentSegmentStart = 0;
  let currentSegmentDetections: BackendFrameDetection[] = [];
  
  for (const frame of frameDetections) {
    const segmentIndex = Math.floor(frame.timestamp_s / segmentDuration);
    const segmentStart = segmentIndex * segmentDuration;
    
    if (segmentStart !== currentSegmentStart && currentSegmentDetections.length > 0) {
      // Finalize previous segment
      segments.push(createSegment(currentSegmentStart, currentSegmentDetections, segmentDuration));
      currentSegmentDetections = [];
    }
    
    currentSegmentStart = segmentStart;
    currentSegmentDetections.push(frame);
  }
  
  // Add final segment
  if (currentSegmentDetections.length > 0) {
    segments.push(createSegment(currentSegmentStart, currentSegmentDetections, segmentDuration));
  }
  
  return segments;
}

function createSegment(startTime: number, frames: BackendFrameDetection[], duration: number): Segment {
  const totalPeople = frames.reduce((sum, f) => sum + f.people_detected, 0);
  
  // Find most common label across frames
  const labelCounts: Record<string, number> = {};
  for (const frame of frames) {
    for (const person of frame.people) {
      const label = extractLabel(person.analysis_result);
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    }
  }
  
  const primaryDetection = Object.entries(labelCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'No detections';
  
  return {
    startTime,
    endTime: startTime + duration,
    primaryDetection,
    detectionCount: totalPeople,
  };
}

