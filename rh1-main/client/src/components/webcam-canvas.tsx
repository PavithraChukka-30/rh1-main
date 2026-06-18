import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Square, RotateCcw, Camera, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// MediaPipe imports
import { Hands, HAND_CONNECTIONS } from "@mediapipe/hands";
import { Camera as MediaPipeCamera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

// Analytics imports
import {
  TrajectoryPoint,
  calculateHandMetrics,
  smoothTrajectory,
  normalizeTrajectory,
  calculatePathLength,
  calculateBoundingBoxArea,
} from "@/lib/hand-analytics";
import {
  generateCircleTemplate,
  generateSquareTemplate,
  generateLineTemplate,
  calculateShapeAccuracy,
} from "@/lib/shape-recognition";

interface WebcamCanvasProps {
  onComplete?: (stats: {
    stability: number;
    smoothness: number;
    accuracy: number;
    time: number;
    jitter: number;
    pathData: TrajectoryPoint[];
  }) => void;
  shape: "circle" | "square" | "line";
  difficulty?: "easy" | "med" | "hard";
}

interface DrawingPoint {
  x: number;
  y: number;
  timestamp: number;
}

export function WebcamCanvas({ onComplete, shape, difficulty = "easy" }: WebcamCanvasProps) {
  /** Auto-stop when the trace looks complete. Closed shapes always require “back near start” so we don’t cut off mid-loop. */
  const AUTO_STOP_ENABLED = true;
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [handPositions, setHandPositions] = useState<DrawingPoint[]>([]);
  const [realTimeMetrics, setRealTimeMetrics] = useState({
    stability: 0,
    smoothness: 0,
    jitter: 0,
  });
  const [detectionStatus, setDetectionStatus] = useState<'waiting' | 'detected' | 'lost'>('waiting');
  const [handDetectionConfidence, setHandDetectionConfidence] = useState(0);
  const [completionPct, setCompletionPct] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<MediaPipeCamera | null>(null);
  const animationFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const previousPointRef = useRef<{ x: number; y: number } | null>(null);
  const lostFramesRef = useRef(0);
  const autoStopTriggeredRef = useRef(false);
  const hasStoppedRef = useRef(false);
  
  // Use ref for hand positions to avoid stale state in the drawing loop
  const handPositionsRef = useRef<DrawingPoint[]>([]);
  const liveMetricsRef = useRef({ stability: 0, smoothness: 0, jitter: 0 });

  const closePathIfNearStart = useCallback(
    (points: DrawingPoint[], width: number, height: number) => {
      if ((shape !== "circle" && shape !== "square") || points.length < 20) return points;
      const first = points[0];
      const last = points[points.length - 1];
      const diagonal = Math.max(1, Math.hypot(width, height));
      const earlyWindow = points.slice(0, Math.min(24, points.length));
      let closest = first;
      let minGap = Number.POSITIVE_INFINITY;
      for (const p of earlyWindow) {
        const d = Math.hypot(last.x - p.x, last.y - p.y);
        if (d < minGap) {
          minGap = d;
          closest = p;
        }
      }

      // More forgiving closure threshold so tiny visible gaps are auto-closed.
      if (minGap / diagonal <= 0.18) {
        const bridge: DrawingPoint[] = [];
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          bridge.push({
            x: last.x + (closest.x - last.x) * t,
            y: last.y + (closest.y - last.y) * t,
            timestamp: last.timestamp + i * 16,
          });
        }
        return [...points, ...bridge];
      }
      return points;
    },
    [shape]
  );

  const shouldAutoStopRecording = useCallback(
    (positions: DrawingPoint[], width: number, height: number) => {
if (positions.length < 60) return false;
      const elapsedMs = positions[positions.length - 1].timestamp - positions[0].timestamp;
      if (elapsedMs < 2200) return false;

      const normalized = normalizeTrajectory(
        positions.map((p) => ({ x: p.x, y: p.y, timestamp: p.timestamp }))
      );
      const smoothed = smoothTrajectory(normalized, 3);

      let template: TrajectoryPoint[];
      if (shape === "circle") template = generateCircleTemplate();
      else if (shape === "square") template = generateSquareTemplate();
      else template = generateLineTemplate();
      template = normalizeTrajectory(template);

      const shapeAccuracy = calculateShapeAccuracy(smoothed, template);

      let tracedPerimeter = 0;
      for (let i = 1; i < smoothed.length; i++) {
        const dx = smoothed[i].x - smoothed[i - 1].x;
        const dy = smoothed[i].y - smoothed[i - 1].y;
        tracedPerimeter += Math.hypot(dx, dy);
      }

      const expectedPerimeter =
        shape === "circle" ? 2 * Math.PI * 0.3 : shape === "square" ? 2.4 : 0.6;
      const perimeterCovered = tracedPerimeter / expectedPerimeter;

      const first = positions[0];
      const last = positions[positions.length - 1];
      const closureDistance = Math.hypot(last.x - first.x, last.y - first.y);

      const earlyWindowSize = Math.min(20, Math.max(6, Math.floor(positions.length * 0.12)));
      const earlyPoints = positions.slice(0, earlyWindowSize);
      const earlyAnchorX = earlyPoints.reduce((sum, p) => sum + p.x, 0) / earlyPoints.length;
      const earlyAnchorY = earlyPoints.reduce((sum, p) => sum + p.y, 0) / earlyPoints.length;
      const anchorClosureDistance = Math.hypot(last.x - earlyAnchorX, last.y - earlyAnchorY);
      let minClosureToEarlyPath = Number.POSITIVE_INFINITY;
      for (let i = 0; i < earlyPoints.length; i++) {
        const d = Math.hypot(last.x - earlyPoints[i].x, last.y - earlyPoints[i].y);
        if (d < minClosureToEarlyPath) minClosureToEarlyPath = d;
      }

      const firstNorm = smoothed[0];
      const lastNorm = smoothed[smoothed.length - 1];
      const endpointSpan = Math.hypot(lastNorm.x - firstNorm.x, lastNorm.y - firstNorm.y);

const profile =
        difficulty === "hard"
          ? { minMatch: 68, minComplete: 74, minPerimeter: 0.88 }
          : difficulty === "med"
            ? { minMatch: 60, minComplete: 68, minPerimeter: 0.82 }
            : { minMatch: 54, minComplete: 60, minPerimeter: 0.72 };

const completionScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (Math.min(1, perimeterCovered) * 65) +
              (Math.min(100, shapeAccuracy.matchScore) * 0.15) +
              (Math.min(100, shapeAccuracy.completeness) * 0.2)
          )
        )
      );
      setCompletionPct(completionScore);

      const minCanvasSide = Math.min(width, height);

      let rawPathLengthPx = 0;
      for (let i = 1; i < positions.length; i++) {
        rawPathLengthPx += Math.hypot(
          positions[i].x - positions[i - 1].x,
          positions[i].y - positions[i - 1].y
        );
      }

const endpointTouchDistancePx =
        difficulty === "hard" ? minCanvasSide * 0.051 : difficulty === "med" ? minCanvasSide * 0.064 : minCanvasSide * 0.0765;
const nearStartByPixels =
        closureDistance <= endpointTouchDistancePx ||
        anchorClosureDistance <= endpointTouchDistancePx * 1.15 ||
        minClosureToEarlyPath <= endpointTouchDistancePx * 1.2;
      const nearStartByNormalized = endpointSpan <= (difficulty === "hard" ? 0.2 : 0.24);
      const nearStart = nearStartByPixels || nearStartByNormalized;

      // --- Line: open trace; do not require loop closure ---
      if (shape === "line") {
        const linePrimary =
          elapsedMs >= 2800 &&
          positions.length >= 32 &&
          endpointSpan >= 0.38 &&
          shapeAccuracy.matchScore >= profile.minMatch &&
          perimeterCovered >= profile.minPerimeter * 0.82;
        const lineFallback =
          elapsedMs >= 6500 &&
          completionScore >= (difficulty === "hard" ? 66 : difficulty === "med" ? 62 : 56) &&
          shapeAccuracy.matchScore >= Math.max(36, profile.minMatch - 14);
        return linePrimary || lineFallback;
      }

      // --- Circle / square: every auto-stop must see the finger back near the start
      // (removes the old “high score only” branch that stopped mid-loop).
      const minLoopDistancePx =
        shape === "circle"
          ? minCanvasSide * (difficulty === "hard" ? 1.28 : difficulty === "med" ? 1.08 : 0.9)
          : minCanvasSide * (difficulty === "hard" ? 1.52 : difficulty === "med" ? 1.28 : 1.08);

      const loopArcOk = rawPathLengthPx >= minLoopDistancePx * 0.84;

      // 1) Natural loop close: enough arc length + endpoint in start zone (light perimeter guard vs scribble)
if (
        elapsedMs >= 3200 &&
        positions.length >= 60 &&
        loopArcOk &&
        nearStart &&
        perimeterCovered >= 0.62
      ) {
        return true;
      }

      // 2) Strong template match + closure (still requires nearStart + path length)
const completionTarget =
        difficulty === "hard" ? 84 : difficulty === "med" ? 80 : 76;
      if (
        elapsedMs >= 4200 &&
        nearStart &&
        (loopArcOk || rawPathLengthPx >= minCanvasSide * 0.92) &&
        perimeterCovered >= profile.minPerimeter * 0.88 &&
        completionScore >= completionTarget &&
        shapeAccuracy.matchScore >= profile.minMatch &&
        shapeAccuracy.completeness >= profile.minComplete - 6
      ) {
        return true;
      }

      // 3) Long session fallback: generous time so users aren’t stuck fixing a tiny gap
const fallbackScore =
        difficulty === "hard" ? 76 : difficulty === "med" ? 72 : 68;
      if (
        elapsedMs >= 12000 &&
        nearStart &&
        perimeterCovered >= profile.minPerimeter * 0.8 &&
        completionScore >= fallbackScore
      ) {
        return true;
      }

      return false;
    },
    [shape, difficulty]
  );

  // Initialize MediaPipe Hands
  useEffect(() => {
    const initializeHands = async () => {
      const hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      hands.onResults(onResults);
      handsRef.current = hands;
      setIsInitialized(true);
    };

    initializeHands();

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (handsRef.current) {
        handsRef.current.close();
      }
    };
  }, []);

  // Handle MediaPipe results
  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Ensure the internal drawing buffer matches the element's CSS size.
    // Without this, drawing happens into a 640x480 buffer while the element may be much larger/smaller,
    // so overlays can look like "nothing is drawn" (1-2px tiny) or appear misaligned.
    const displayW = Math.floor(canvas.clientWidth || 0);
    const displayH = Math.floor(canvas.clientHeight || 0);
    if (displayW > 0 && displayH > 0 && (canvas.width !== displayW || canvas.height !== displayH)) {
      canvas.width = displayW;
      canvas.height = displayH;
    }

    // Clear canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror the canvas for natural camera feel (video only)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Reset transform for overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw shape guide (non-mirrored overlay)
    drawShapeGuide(ctx, canvas.width, canvas.height);

    const drawTrail = () => {
      if (!isRecording) return;
      const trailPoints = handPositionsRef.current.slice(-350);
      if (trailPoints.length <= 1) return;

      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowBlur = 4;
      ctx.shadowColor = "rgba(6, 182, 212, 0.45)";

      for (let i = 0; i < trailPoints.length - 1; i++) {
        const progress = i / trailPoints.length;
        const alpha = 0.2 + progress * 0.8;
        const width = 2 + progress * 5;
        ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(trailPoints[i].x, trailPoints[i].y);
        ctx.lineTo(trailPoints[i + 1].x, trailPoints[i + 1].y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    // Update detection status
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      lostFramesRef.current = 0;
      setDetectionStatus('detected');
      setHandDetectionConfidence(
        results.multiHandedness?.[0]?.score || 0.8
      );

      const landmarks = results.multiHandLandmarks[0];

      // Mirror landmarks for drawing (flip x-coordinates)
      const mirroredLandmarks = landmarks.map((lm: any) => ({
        x: 1 - lm.x,
        y: lm.y,
        z: lm.z
      }));

      // Draw hand landmarks and connections using MediaPipe's HAND_CONNECTIONS
      drawConnectors(ctx, mirroredLandmarks, HAND_CONNECTIONS, { 
        color: '#00FF00', 
        lineWidth: 3 
      });

      drawLandmarks(ctx, mirroredLandmarks, { 
        color: '#FF0000', 
        lineWidth: 2, 
        radius: 5,
        fillColor: '#FF0000'
      });

      // Track index finger tip (landmark 8) for drawing
      const indexFingerTip = mirroredLandmarks[8];
      let x = indexFingerTip.x * canvas.width;
      let y = indexFingerTip.y * canvas.height;

      if (previousPointRef.current) {
        const dx = x - previousPointRef.current.x;
        const dy = y - previousPointRef.current.y;
        const distance = Math.hypot(dx, dy);
        const maxJump = Math.min(canvas.width, canvas.height) * 0.06;

        if (distance > maxJump) {
          const ratio = maxJump / distance;
          x = previousPointRef.current.x + dx * ratio;
          y = previousPointRef.current.y + dy * ratio;
        }

        x = previousPointRef.current.x + (x - previousPointRef.current.x) * 0.35;
        y = previousPointRef.current.y + (y - previousPointRef.current.y) * 0.35;
      }

      previousPointRef.current = { x, y };

      if (isRecording) {
        const newPosition: DrawingPoint = {
          x,
          y,
          timestamp: Date.now()
        };

        // Update the ref immediately for drawing
        handPositionsRef.current = [...handPositionsRef.current, newPosition].slice(-500);
        
        // Update state for metrics (async)
        setHandPositions(prev => {
          const updated = [...prev, newPosition];
          
          // Update real-time metrics every 10 frames
          if (updated.length % 10 === 0) {
            const trajectoryPoints: TrajectoryPoint[] = updated.map(p => ({
              x: p.x,
              y: p.y,
              timestamp: p.timestamp,
            }));
            
            const metrics = calculateHandMetrics(trajectoryPoints);
            const latestLive = {
              stability: metrics.stability,
              smoothness: metrics.smoothness,
              jitter: metrics.jitter,
            };
            liveMetricsRef.current = latestLive;
            setRealTimeMetrics(latestLive);
          }

          return updated.slice(-500); // Keep last 500 points
        });

        if (
          AUTO_STOP_ENABLED &&
          !autoStopTriggeredRef.current &&
          handPositionsRef.current.length >= 60 &&
          shouldAutoStopRecording(handPositionsRef.current, canvas.width, canvas.height)
        ) {
          autoStopTriggeredRef.current = true;
          const finalizedPath = closePathIfNearStart(
            handPositionsRef.current,
            canvas.width,
            canvas.height
          );
          handleStop(finalizedPath);
          return;
        }
        drawTrail();
        
        // Draw current position with bright glow on top
        ctx.shadowBlur = 30;
        ctx.shadowColor = "#06b6d4";
        ctx.fillStyle = "#06b6d4";
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright inner circle
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // When not recording but hand is detected, show the fingertip indicator
        // This provides visual feedback that hand tracking is working
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#06b6d4";
        ctx.fillStyle = "#06b6d4";
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw fingertip indicators for all visible fingers (more visible)
      const fingerTips = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
      for (const tip of fingerTips) {
        const finger = mirroredLandmarks[tip];
        const fingerX = finger.x * canvas.width;
        const fingerY = finger.y * canvas.height;
        
        // Outer glow
        ctx.beginPath();
        ctx.arc(fingerX, fingerY, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
        ctx.fill();
        
        // Main circle
        ctx.beginPath();
        ctx.arc(fingerX, fingerY, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else {
      lostFramesRef.current += 1;
      if (lostFramesRef.current > 6) {
        setDetectionStatus("lost");
        setHandDetectionConfidence(0);
        previousPointRef.current = null;
      }
      drawTrail();
    }

    ctx.restore();
  }, [isRecording, shape, difficulty, shouldAutoStopRecording, closePathIfNearStart]);

  useEffect(() => {
    if (handsRef.current) {
      handsRef.current.onResults(onResults);
    }
  }, [onResults]);

  // Draw shape guide
  const drawShapeGuide = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const difficultyScale = difficulty === "hard" ? 0.18 : difficulty === "med" ? 0.22 : 0.25;
    const radius = Math.min(width, height) * difficultyScale;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.62)";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(255,255,255,0.28)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();

    if (shape === "circle") {
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    } else if (shape === "square") {
      ctx.rect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    } else if (shape === "line") {
      ctx.moveTo(centerX - radius, centerY);
      ctx.lineTo(centerX + radius, centerY);
    }

    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  };

  // Start webcam
  const startWebcam = async () => {
    if (!videoRef.current || !handsRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });

      videoRef.current.srcObject = stream;

      cameraRef.current = new MediaPipeCamera(videoRef.current, {
        onFrame: async () => {
          if (handsRef.current) {
            await handsRef.current.send({ image: videoRef.current! });
          }
        },
        width: 640,
        height: 480
      });

      cameraRef.current.start();
    } catch (error) {
      console.error('Error accessing webcam:', error);
    }
  };

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      startTimeRef.current = Date.now();
      interval = setInterval(() => {
        setTimer(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Calculate comprehensive metrics
  const calculateMetrics = (capturedPoints: DrawingPoint[]): {
    stability: number;
    smoothness: number;
    accuracy: number;
    jitter: number;
  } => {
    if (capturedPoints.length < 10) {
      return { stability: 0, smoothness: 0, accuracy: 0, jitter: 0 };
    }

    // Convert drawing points to trajectory points
    const trajectoryPoints: TrajectoryPoint[] = capturedPoints.map(p => ({
      x: p.x,
      y: p.y,
      timestamp: p.timestamp,
    }));

    // Keep final metric math identical to real-time metric math.
    const smoothedRaw = smoothTrajectory(trajectoryPoints, 3);

    // Guard against "no real tracing" attempts.
    // Without enough movement, normalized variance can still look artificially stable.
    const rawPathLength = calculatePathLength(trajectoryPoints);
    const normalizedArea = calculateBoundingBoxArea(normalizeTrajectory(smoothedRaw));
    const elapsedMs =
      trajectoryPoints[trajectoryPoints.length - 1].timestamp - trajectoryPoints[0].timestamp;
    const canvas = canvasRef.current;
    const canvasDiagonal = canvas ? Math.hypot(canvas.width || 640, canvas.height || 480) : 800;
    const minPathLength = canvasDiagonal * 0.08;
    const minArea = shape === "line" ? 0.0005 : 0.002;
    const hasMeaningfulTracing =
      elapsedMs >= 1500 &&
      rawPathLength >= minPathLength &&
      normalizedArea >= minArea;

    if (!hasMeaningfulTracing) {
      return { stability: 0, smoothness: 0, accuracy: 0, jitter: 0 };
    }

    // Calculate metrics
    const metrics = calculateHandMetrics(trajectoryPoints);

    // Get shape template
    let template: TrajectoryPoint[];
    if (shape === "circle") {
      template = generateCircleTemplate();
    } else if (shape === "square") {
      template = generateSquareTemplate();
    } else {
      template = generateLineTemplate();
    }

    // Normalize template to same scale
    template = normalizeTrajectory(template);

    // Calculate shape accuracy
    const shapeAccuracy = calculateShapeAccuracy(normalizeTrajectory(smoothedRaw), template);

    return {
      stability: metrics.stability,
      smoothness: metrics.smoothness,
      accuracy: shapeAccuracy.matchScore,
      jitter: metrics.jitter,
    };
  };

  const handleStart = async () => {
    if (!isInitialized) return;

    // Reset both state and ref for hand positions
    setHandPositions([]);
    handPositionsRef.current = [];
    previousPointRef.current = null;
    lostFramesRef.current = 0;
    autoStopTriggeredRef.current = false;
    hasStoppedRef.current = false;
    liveMetricsRef.current = { stability: 0, smoothness: 0, jitter: 0 };
    setCompletionPct(0);
    
    await startWebcam();
    setIsRecording(true);
    setTimer(0);
  };

  const handleStop = (capturedPath?: DrawingPoint[] | unknown) => {
    if (hasStoppedRef.current) return;
    hasStoppedRef.current = true;
    setIsRecording(false);
    if (cameraRef.current) {
      cameraRef.current.stop();
    }

    const rawPath = Array.isArray(capturedPath) ? capturedPath : handPositionsRef.current;
    const canvas = canvasRef.current;
    const sourcePath = closePathIfNearStart(
      rawPath,
      canvas?.width || 640,
      canvas?.height || 480
    );
    const computed = calculateMetrics(sourcePath);
    const hasLiveSnapshot =
      liveMetricsRef.current.stability > 0 ||
      liveMetricsRef.current.smoothness > 0 ||
      liveMetricsRef.current.jitter > 0;
    const metrics = hasLiveSnapshot
      ? {
          stability: liveMetricsRef.current.stability,
          smoothness: liveMetricsRef.current.smoothness,
          jitter: liveMetricsRef.current.jitter,
          accuracy: computed.accuracy,
        }
      : computed;
    const elapsedTime = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
    const pathData: TrajectoryPoint[] = sourcePath.map((p) => ({
      x: p.x,
      y: p.y,
      timestamp: p.timestamp,
    }));

    if (onComplete) {
      onComplete({
        stability: metrics.stability,
        smoothness: metrics.smoothness,
        accuracy: metrics.accuracy,
        jitter: metrics.jitter,
        time: elapsedTime,
        pathData,
      });
    }
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-muted">
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover -scale-x-100"
      />

      {/* Overlay Canvas for Drawing */}
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="absolute inset-0 w-full h-full z-10"
      />

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-20 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-white font-mono text-sm border border-white/10">
        {shape.toUpperCase()} MODE
      </div>

      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        <div className="bg-red-500/80 backdrop-blur px-3 py-1 rounded-full text-white font-mono text-sm animate-pulse">
          {isRecording ? `REC ${timer}s` : "READY"}
        </div>
        
        {/* Detection Status */}
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono backdrop-blur ${
          detectionStatus === 'detected' 
            ? 'bg-green-500/80 text-white' 
            : 'bg-yellow-500/80 text-black'
        }`}>
          {detectionStatus === 'detected' ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <AlertCircle className="w-3 h-3" />
          )}
          {detectionStatus === 'detected' ? 'Hand Detected' : 'No Hand'}
        </div>

        {/* Confidence */}
        <div className="bg-blue-500/80 backdrop-blur px-3 py-1 rounded-full text-white font-mono text-xs">
          Conf: {Math.round(handDetectionConfidence * 100)}%
        </div>
      </div>

      {/* Real-time metrics display */}
      {isRecording && (
        <div className="absolute bottom-24 right-4 z-20 bg-black/60 backdrop-blur rounded-lg p-3 text-white font-mono text-xs space-y-1 border border-white/20">
          <div>Stability: {realTimeMetrics.stability}</div>
          <div>Smoothness: {realTimeMetrics.smoothness}</div>
          <div>Jitter: {realTimeMetrics.jitter}</div>
          <div>Completion: {completionPct}%</div>
          <div>Points: {handPositions.length}</div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center gap-4">
        {!isRecording ? (
          <Button 
            size="lg" 
            className="rounded-full w-16 h-16 shadow-lg bg-green-500 hover:bg-green-600 border-4 border-black/20"
            onClick={handleStart}
          >
            <Play className="h-8 w-8 ml-1 fill-current" />
          </Button>
        ) : (
          <Button 
            size="lg" 
            variant="destructive"
            className="rounded-full w-16 h-16 shadow-lg border-4 border-black/20"
            onClick={() => handleStop()}
          >
            <Square className="h-8 w-8 fill-current" />
          </Button>
        )}
      </div>
    </div>
  );
}
