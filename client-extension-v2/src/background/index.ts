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
});

async function handleUpload(data: { events: any[]; workflowName?: string }) {
  try {
    const jsonl = data.events.map((e: any) => JSON.stringify(e)).join("\n");
    const blob = new Blob([jsonl], { type: "application/x-jsonlines" });
    
    // Use workflowName if provided, otherwise default to timestamp
    const safeName = data.workflowName 
      ? data.workflowName.replace(/[^a-z0-9]/gi, '_').toLowerCase() 
      : `session-record-${new Date().toISOString()}`;
    const filename = `${safeName}.jsonl`;

    // We can't send a File object directly from content script to background easily due to serialization
    // But we can reconstruct it or send as Blob/text.
    // Actually, sending FormData is tricky across message passing if it contains Blobs sometimes.
    // However, since we are in the background script, we can construct the FormData here.

    const formData = new FormData();
    formData.append("file", blob, filename);

    const response = await fetch("http://localhost:3000/api/upload", {
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
