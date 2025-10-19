"use client";

import React, { useEffect, useRef, useState } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd"; // No changes in this line
import * as tf from "@tensorflow/tfjs";
import {
  FaceLandmarker,
  FilesetResolver,
  FaceLandmarkerResult,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export default function VideoFeed({
  onEvent,
}: {
  onEvent: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(
    null
  );
  const [phoneModel, setPhoneModel] = useState<any>(null);
  const lastFaceTimeRef = useRef(Date.now());
  const noFaceAlertSent = useRef(false);
  const lookingAwayAlertSent = useRef(false);
  const detectedObjectsRef = useRef<Set<string>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);

  const PROHIBITED_OBJECT_MAP: { [key: string]: string } = {
    "cell phone": "Electronic device",
    remote: "Electronic device",
    book: "Book",
    laptop: "Laptop",
    mouse: "Mouse",
  };
  // Initialize models and camera
  useEffect(() => {
    let isMounted = true;

    const initModelsAndCamera = async () => {
      try {
        // Load MediaPipe FaceLandmarker
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFacialTransformationMatrixes: true,
          numFaces: 5, // Detect multiple faces
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
        });
        if (!isMounted) return;
        setFaceLandmarker(landmarker);

        await tf.ready();

        // Load TensorFlow COCO-SSD (Phone Detection)
        const model = await cocoSsd.load();
        if (!isMounted) return;
        setPhoneModel(model);

        // Start webcam
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        streamRef.current = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;

          // Ensure video is playing and has dimensions
          await new Promise<void>((resolve) => {
            videoRef.current!.onloadedmetadata = () => {
              videoRef.current?.play();
              resolve();
            };
          });
        }

        onEvent("Camera and models initialized");
      } catch (err: any) {
        onEvent("Initialization error: " + (err.message || err));
      }
    };

    initModelsAndCamera();

    return () => {
      isMounted = false;

      // Stop webcam
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Close face detector
      faceLandmarker?.close();
    };
  }, [onEvent]);

  // Detection loop
  useEffect(() => {
    let animationFrameId: number;

    const detectLoop = async () => {
      const video = videoRef.current;
      if (!video || !faceLandmarker || !phoneModel) {
        animationFrameId = requestAnimationFrame(detectLoop);
        return;
      }

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameId = requestAnimationFrame(detectLoop);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        // Face detection
        const faceLandmarkerResult = faceLandmarker.detectForVideo(
          video,
          performance.now()
        );

        if (
          !faceLandmarkerResult.faceLandmarks ||
          faceLandmarkerResult.faceLandmarks.length === 0
        ) {
          if (Date.now() - lastFaceTimeRef.current > 5000) {
            if (!noFaceAlertSent.current) {
              onEvent("No face detected for >5 seconds");
              noFaceAlertSent.current = true;
            }
          }
        } else {
          if (noFaceAlertSent.current) {
            onEvent("Face detected");
            noFaceAlertSent.current = false;
          }

          if (faceLandmarkerResult.faceLandmarks.length > 1) {
            onEvent("Multiple faces detected");
          }
          lastFaceTimeRef.current = Date.now();

          // Head-pose detection for looking away
          if (
            faceLandmarkerResult.facialTransformationMatrixes &&
            faceLandmarkerResult.facialTransformationMatrixes.length > 0
          ) {
            const matrix =
              faceLandmarkerResult.facialTransformationMatrixes[0].data;
            // Calculate yaw
            const yaw = Math.atan2(matrix[8], matrix[10]) * (180 / Math.PI);

            const YAW_THRESHOLD = 25; // degrees
            let headPoseColor = "green";
            if (Math.abs(yaw) > YAW_THRESHOLD) {
              headPoseColor = "red";
              if (!lookingAwayAlertSent.current) {
                onEvent(
                  `Looking away from the screen (yaw: ${yaw.toFixed(2)}°)`
                );
                lookingAwayAlertSent.current = true;
              }
            } else {
              lookingAwayAlertSent.current = false;
            }

            // Draw face bounding box
            drawBoundingBoxFromLandmarks(
              ctx,
              faceLandmarkerResult.faceLandmarks[0],
              video,
              headPoseColor
            );
          } else {
            lookingAwayAlertSent.current = false;
            // Draw face bounding box even if pose can't be estimated
            drawBoundingBoxFromLandmarks(
              ctx,
              faceLandmarkerResult.faceLandmarks[0],
              video,
              "green"
            );
          }
        }

        // Object detection
        const predictions = await phoneModel.detect(video);
        const currentObjects = new Set<string>();
        const prohibitedKeys = Object.keys(PROHIBITED_OBJECT_MAP);

        for (const p of predictions) {
          if (prohibitedKeys.includes(p.class) && p.score > 0.5) {
            currentObjects.add(PROHIBITED_OBJECT_MAP[p.class]);

            // Draw object bounding box
            ctx.strokeStyle = "red";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.rect(p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]);
            ctx.stroke();
            ctx.fillStyle = "red";
            ctx.font = "18px Arial";
            ctx.fillText(
              PROHIBITED_OBJECT_MAP[p.class],
              p.bbox[0],
              p.bbox[1] > 10 ? p.bbox[1] - 5 : 15
            );
          }
        }

        // Check for newly detected objects
        for (const obj of currentObjects) {
          if (!detectedObjectsRef.current.has(obj)) {
            onEvent(`${obj.charAt(0).toUpperCase() + obj.slice(1)} detected`);
          }
        }

        // Check for removed objects
        for (const obj of detectedObjectsRef.current) {
          if (!currentObjects.has(obj)) {
            onEvent(`${obj.charAt(0).toUpperCase() + obj.slice(1)} removed`);
          }
        }
        detectedObjectsRef.current = currentObjects;
      } catch (err: any) {
        onEvent("Detection error: " + (err.message || err));
      }

      animationFrameId = requestAnimationFrame(detectLoop);
    };

    detectLoop();

    return () => cancelAnimationFrame(animationFrameId);
  }, [faceLandmarker, phoneModel, onEvent, PROHIBITED_OBJECT_MAP]);

  const drawBoundingBoxFromLandmarks = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    video: HTMLVideoElement,
    color: string
  ) => {
    if (!landmarks || landmarks.length === 0) return;

    let minX = video.videoWidth,
      minY = video.videoHeight,
      maxX = 0,
      maxY = 0;

    for (const landmark of landmarks) {
      const x = landmark.x * video.videoWidth;
      const y = landmark.y * video.videoHeight;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  };

  return (
    <div className="relative flex justify-center w-[640px]">
      <video
        ref={videoRef}
        className="rounded-lg border border-gray-300 shadow-md w-[640px] h-[480px]"
        autoPlay
        muted
        playsInline
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0"
        width="640"
        height="480"
        // style={{ transform: "scaleX(1)" }}
      />
    </div>
  );
}
