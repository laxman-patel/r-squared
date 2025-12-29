import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./views/App.tsx";
import { startDomRecording } from "@/lib/dom-recorder";

console.log("[CRXJS] Hello world from content script!");

// --- Recording Logic ---

let stopRecording: (() => any[]) | undefined;
let isRecording = false;
let screenshotInterval: ReturnType<typeof setInterval> | undefined;
let screenshots: { timestamp: number; dataUrl: string }[] = [];

// Handle messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_STATUS") {
    sendResponse({ isRecording });
    return;
  }

  if (message.type === "START_RECORDING") {
    if (isRecording) {
      sendResponse({ status: "already_recording" });
      return;
    }

    console.log("[Recorder] Starting recording...");
    isRecording = true;
    screenshots = []; // Reset screenshots

    // Start dom-recorder
    const session = startDomRecording();
    stopRecording = session.stop;

    // Start screenshot interval (every 2 seconds)
    screenshotInterval = setInterval(() => {
      chrome.runtime.sendMessage(
        { type: "TAKE_SCREENSHOT", quality: 13 }, // Low quality 13%
        (response) => {
          if (chrome.runtime.lastError) return;
          if (response && response.success && response.dataUrl) {
            screenshots.push({
              timestamp: Date.now(),
              dataUrl: response.dataUrl,
            });
          }
        },
      );
    }, 2000);

    sendResponse({ status: "started" });
  }

  if (message.type === "STOP_RECORDING") {
    if (!isRecording) {
      sendResponse({ status: "not_recording" });
      return;
    }

    console.log("[Recorder] Stopping recording...");
    isRecording = false;

    if (screenshotInterval) {
      clearInterval(screenshotInterval);
      screenshotInterval = undefined;
    }

    if (stopRecording) {
      const events = stopRecording();
      stopRecording = undefined;
      // Trigger download
      saveRecording(events, screenshots, message.data?.workflowName);
    } else {
      console.warn("[Recorder] No recorder instance found.");
    }

    sendResponse({ status: "stopped" });
  }
});

async function saveRecording(
  events: any[],
  screenshots: any[],
  workflowName?: string,
) {
  if (events.length === 0) {
    console.warn("[Recorder] No events to save.");
    return;
  }

  // Send to background script for upload
  chrome.runtime.sendMessage(
    {
      type: "UPLOAD_RECORDING",
      data: { events, screenshots, workflowName },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[Recorder] Message error:",
          chrome.runtime.lastError.message,
        );
        return;
      }
      if (response && response.success) {
        console.log("[Recorder] Recording uploaded successfully");
      } else {
        console.error(
          "[Recorder] Upload failed:",
          response?.error || "Unknown error",
        );
      }
    },
  );
}

// --- End Recording Logic ---

const container = document.createElement("div");
container.id = "crxjs-app";
document.body.appendChild(container);
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
