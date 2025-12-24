import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./views/App.tsx";
import { record } from "rrweb";

console.log("[CRXJS] Hello world from content script!");

// --- Recording Logic ---

let events: any[] = [];
let stopFn: (() => void) | undefined;
let isRecording = false;

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
    events = [];
    isRecording = true;

    // Start rrweb recording
    stopFn = record({
      emit(event) {
        events.push(event);
      },
      // Optimization for LLM processing: Reduce noise and file size
      sampling: {
        mousemove: false, // Don't record mouse path
        scroll: 150, // Throttle scroll events
        input: "last", // Record only final input values
      },
      inlineImages: false, // Don't inline images as Base64
      inlineStylesheet: false, // Don't inline stylesheets
      collectFonts: false, // Don't collect fonts
      slimDOMOptions: {
        script: true, // Remove <script> tags
        comment: true, // Remove comments
        headFavicon: true, // Remove favicon
      },
    });

    sendResponse({ status: "started" });
  }

  if (message.type === "STOP_RECORDING") {
    if (!isRecording) {
      sendResponse({ status: "not_recording" });
      return;
    }

    console.log("[Recorder] Stopping recording...");
    if (stopFn) {
      stopFn();
      stopFn = undefined;
    }
    isRecording = false;

    // Trigger download
    saveRecording();

    sendResponse({ status: "stopped" });
  }
});

function saveRecording() {
  if (events.length === 0) {
    console.warn("[Recorder] No events to save.");
    return;
  }

  const blob = new Blob([JSON.stringify(events)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = `session-record-${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
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
