"use client";

import React, { useEffect, useRef, useState } from "react";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function VideoFeed({
  onEvent,
}: {
  onEvent: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
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
          if (faceLandmarkerResult.faceLandmarks.length > 1) {
            onEvent("Multiple faces detected");
          }
          lastFaceTimeRef.current = Date.now();
          noFaceAlertSent.current = false; // Reset alert when face is detected

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
            if (Math.abs(yaw) > YAW_THRESHOLD) {
              if (!lookingAwayAlertSent.current) {
                onEvent(
                  `Looking away from the screen (yaw: ${yaw.toFixed(2)}°)`
                );
                lookingAwayAlertSent.current = true;
              }
            } else {
              lookingAwayAlertSent.current = false;
            }
          } else {
            lookingAwayAlertSent.current = false;
          }
        }

        // Phone detection
        const predictions = await phoneModel.detect(video);
        const currentObjects = new Set<string>();
        const prohibitedKeys = Object.keys(PROHIBITED_OBJECT_MAP);
        for (const p of predictions) {
          if (prohibitedKeys.includes(p.class) && p.score > 0.5) {
            currentObjects.add(PROHIBITED_OBJECT_MAP[p.class]);
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
  }, [faceLandmarker, phoneModel, onEvent]);

  return (
    <div className="relative w-full flex justify-center">
      <video
        ref={videoRef}
        className="rounded-lg border border-gray-300 shadow-md w-[640px] h-[480px]"
        autoPlay
        muted
        playsInline
      />
    </div>
  );
}
