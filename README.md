# 🎥 AI Video Proctoring System

This project is a web-based AI proctoring system built with Next.js, TypeScript, and Google's MediaPipe. It monitors a user's video feed in real-time to detect various events that might indicate academic dishonesty during an online assessment.

## ✨ Features

- **Face Detection**:
  - Detects if a face is present in the video feed.
  - Logs an event if **no face is detected** for more than 5 seconds.
  - Logs an event if **multiple faces** are detected.
- **Head Pose Estimation**:
  - Analyzes the user's head orientation (yaw).
  - Logs an event if the user is **looking away** from the screen.
- **Object Detection**:
  - Identifies prohibited items such as electronic devices (phones, remotes), books, and laptops.
  - Logs distinct events for when an object is **detected** and when it is **removed**.
- **Real-time Event Logging**: A clean, timestamped log on the UI displays all detected events as they happen.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (React)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **AI / Machine Learning**:
  - **MediaPipe (`@mediapipe/tasks-vision`)**: Used for high-performance on-device ML.
    - `FaceLandmarker`: Powers face detection, multi-face detection, and head pose estimation.
  - **TensorFlow.js (`@tensorflow-models/coco-ssd`)**:
    - `COCO-SSD`: A pre-trained model used for general object detection (phones, books, etc.).
- **Styling**: Tailwind CSS

## ⚙️ How It Works

The application's core logic resides within the `VideoFeed.tsx` component.

1.  **Initialization**:

    - On component mount, it requests access to the user's webcam.
    - It asynchronously loads the MediaPipe `FaceLandmarker` and the TensorFlow.js `coco-ssd` models. The models are configured to run on the GPU for better performance.

2.  **Detection Loop**:

    - A `useEffect` hook initiates a continuous detection loop using `requestAnimationFrame`, which is highly efficient for video processing.
    - In each animation frame, the component performs two key AI tasks on the current video frame:

3.  **Face and Head Pose Analysis**:

    - The `FaceLandmarker` model processes the frame to find face landmarks and facial transformation matrices.
    - **No Face/Multiple Faces**: The system checks the number of detected faces. It uses a `useRef` timer to trigger a "No face detected" alert only after 5 seconds of absence.
    - **Looking Away**: The 3D facial transformation matrix is used to calculate the head's yaw angle (left/right turn). If the angle exceeds a `YAW_THRESHOLD` of 25 degrees, a "Looking away" event is logged. A flag (`lookingAwayAlertSent`) prevents this event from firing on every single frame.

4.  **Object Detection**:

    - The `coco-ssd` model scans the frame for a predefined list of prohibited objects (`PROHIBITED_OBJECT_MAP`).
    - To avoid confusion between similar objects (like a 'cell phone' and a 'remote'), they are grouped under a generic category like 'Electronic device'.
    - The system maintains a `Set` of currently detected objects (`detectedObjectsRef`). By comparing the objects in the current frame to the previous one, it can intelligently log specific "detected" and "removed" events, providing a clean and accurate event history.

5.  **Event Handling**:
    - When any of the above events are triggered, the `VideoFeed` component calls the `onEvent` callback function.
    - The parent `Home` page receives this event, adds a timestamp, and updates the state, which re-renders the `EventLog` component with the new entry.

## 🚀 Getting Started

Follow these steps to get the project running on your local machine.

### Prerequisites

- Node.js (v18 or later recommended)
- npm, yarn, or pnpm

### Installation

1.  Clone the repository:

    ```bash
    git clone <your-repository-url>
    cd video-proctoring-system
    ```

2.  Install the dependencies:

    ```bash
    npm install
    ```

3.  Run the development server:

    ```bash
    npm run dev
    ```

4.  Open http://localhost:3000 in your browser. The application will request camera permission to start the proctoring session.

## 🔮 Future Improvements

- **Draw Bounding Boxes**: Enhance the UI by drawing bounding boxes around detected faces and objects directly on the video feed.
- **Gaze Detection**: Implement eye-tracking to determine if the user is looking at a different part of the screen.
- **Audio Monitoring**: Add functionality to detect suspicious sounds, like another person speaking.
- **Backend Integration**: Send event logs to a backend server to be stored in a database for reporting and review.

---
