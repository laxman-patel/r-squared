import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./views/App.tsx";
import { startDomRecording, captureDomSnapshot } from "@/lib/dom-recorder";
import type { ActionPayload } from "@/lib/types";

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
    }, 5000);

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

  if (message.type === "CAPTURE_WEBCONTEXT") {
    captureWebContext().then(sendResponse);
    return true;
  }

  if (message.type === "EXECUTE_ACTION") {
    executeActionInTab(message.action).then(sendResponse);
    return true;
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

async function captureWebContext() {
  const dataUrl = await chrome.runtime.sendMessage({ type: "TAKE_SCREENSHOT", quality: 50 });
  if (!dataUrl.success) throw new Error(dataUrl.error);

  const jsonl = captureDomSnapshot();

  return { jsonl, image: dataUrl.dataUrl };
}

async function executeActionInTab(action: ActionPayload) {
  const { executeAction } = await import("./execution-engine");
  try {
    const result = await executeAction(action);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
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
