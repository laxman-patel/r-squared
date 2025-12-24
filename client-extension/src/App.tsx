import { useState } from "react";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>("Idle");

  const sendCommand = async (action: "START_RECORDING" | "STOP_RECORDING") => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.id) {
        setStatus("Error: No active tab");
        return;
      }

      if (tab.url?.startsWith("chrome://")) {
        setStatus("Error: Restricted Page");
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action }, (response) => {
        if (chrome.runtime.lastError) {
          setStatus("Error: Refresh Page");
          console.log("sendMessage error: ", chrome.runtime.lastError);
          return;
        }

        if (response?.status === "started") {
          setIsRecording(true);
          setStatus("Recording...");
        } else if (response?.status === "stopped") {
          setIsRecording(false);
          setStatus(`Saved ${response.eventCount} events`);
        } else if (response?.status === "already_running") {
          setIsRecording(true);
          setStatus("Already Recording");
        }
      });
    } catch (error) {
      console.error(error);
      setStatus("Comm Error");
    }
  };

  return (
    <div className="w-80 h-auto bg-gray-50 text-gray-800 font-sans p-6 shadow-lg border border-gray-200">
      {/* Header */}
      <div className="flex flex-col items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">
          RRWeb Recorder
        </h2>
        <span className="text-xs text-gray-500 mt-1">DOM Session Capture</span>
      </div>

      {/* Control Buttons */}
      <div className="flex gap-4 justify-center mb-6">
        <button
          onClick={() => sendCommand("START_RECORDING")}
          disabled={isRecording}
          className={`
            px-5 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm
            ${
              isRecording
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-green-600 text-white hover:bg-green-700 hover:shadow-md active:scale-95"
            }
          `}
        >
          Start
        </button>

        <button
          onClick={() => sendCommand("STOP_RECORDING")}
          disabled={!isRecording}
          className={`
            px-5 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm
            ${
              !isRecording
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-red-500 text-white hover:bg-red-600 hover:shadow-md active:scale-95"
            }
          `}
        >
          Stop
        </button>
      </div>

      {/* Status Indicator */}
      <div className="bg-white rounded-md p-3 border border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Status
        </span>
        <div className="flex items-center gap-2">
          {/* Pulsing Dot Animation */}
          {isRecording && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}

          <span
            className={`text-sm font-medium ${isRecording ? "text-red-600" : "text-gray-600"}`}
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
