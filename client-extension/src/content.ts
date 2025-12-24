console.log("🚀 CONTENT SCRIPT LOADED");

import type { eventWithTime } from "@rrweb/types";

const script = document.createElement("script");
script.src = chrome.runtime.getURL("rrweb.min.js");
(document.head || document.documentElement).appendChild(script);

script.onload = () => {
  console.log("rrweb script injected and loaded");
  // Your message listener logic goes here...
};

// --- State Variables ---
let events: eventWithTime[] = [];
let stopFn: (() => void) | undefined;

// --- Helper: Save to File ---
// Triggers a download directly from the DOM context
const saveRecording = (data: eventWithTime[]) => {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `rrweb-session-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "START_RECORDING") {
    if (stopFn) {
      sendResponse({ status: "already_running" });
      return;
    }

    console.log("🎥 [rrweb] Recording started...");
    events = []; // Reset buffer

    // Start rrweb recording
    // @ts-expect-error temp
    stopFn = rrweb.record({
      // @ts-expect-error temp
      emit(event) {
        // Push event to the buffer
        events.push(event);
      },
      // Optional: Checkout every 2 minutes or similar if you want multiple snapshots
      // checkoutEvery: [0],
    });

    sendResponse({ status: "started" });
  } else if (message.action === "STOP_RECORDING") {
    if (!stopFn) {
      sendResponse({ status: "not_running" });
      return;
    }

    // Stop rrweb
    stopFn();
    stopFn = undefined;

    console.log("[rrweb] Recording stopped.");
    console.log("Payload:", events);

    // Save the file
    saveRecording(events);

    sendResponse({ status: "stopped", eventCount: events.length });
  }

  // Required for asynchronous sendResponse behavior in some setups
  return true;
});
