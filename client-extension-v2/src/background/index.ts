console.log("[CRXJS] Service Worker running");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[CRXJS] Extension installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "UPLOAD_RECORDING") {
    handleUpload(message.data).then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === "FETCH_FILES") {
    handleFetchFiles().then(sendResponse);
    return true; // Keep channel open
  }

  if (message.type === "TAKE_SCREENSHOT") {
    handleScreenshot(message.quality).then(sendResponse);
    return true;
  }
});

async function handleScreenshot(quality: number) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(
      chrome.windows.WINDOW_ID_CURRENT,
      {
        format: "jpeg",
        quality: quality,
      },
    );
    return { success: true, dataUrl };
  } catch (error) {
    console.error("Screenshot error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function handleUpload(data: {
  events: any[];
  screenshots: { timestamp: number; dataUrl: string }[];
  workflowName?: string;
}) {
  try {
    const jsonl = data.events.map((e: any) => JSON.stringify(e)).join("\n");
    const blob = new Blob([jsonl], { type: "application/x-jsonlines" });

    // Use workflowName if provided, otherwise default to timestamp
    const safeName = data.workflowName
      ? data.workflowName.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      : `session-record-${new Date().toISOString()}`;
    const filename = `${safeName}.jsonl`;

    const formData = new FormData();
    formData.append("file", blob, filename);

    // Append screenshots
    if (data.screenshots && data.screenshots.length > 0) {
      // Helper to convert base64 to Blob
      const base64ToBlob = (base64: string, type: string) => {
        const binStr = atob(base64.split(",")[1]);
        const len = binStr.length;
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          arr[i] = binStr.charCodeAt(i);
        }
        return new Blob([arr], { type });
      };

      data.screenshots.forEach((shot) => {
        const blob = base64ToBlob(shot.dataUrl, "image/jpeg");
        const filename = `screenshot-${shot.timestamp}.jpg`;
        formData.append(`screenshots`, blob, filename);
      });
    }

    const response = await fetch("http://localhost:3000/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function handleFetchFiles() {
  try {
    const response = await fetch("http://localhost:3000/files");
    if (!response.ok) {
      throw new Error(`Failed to fetch files: ${response.statusText}`);
    }
    const data = await response.json();
    return { success: true, files: data.files };
  } catch (error) {
    console.error("Fetch files error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
