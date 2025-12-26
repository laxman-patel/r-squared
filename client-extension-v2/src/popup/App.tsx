import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tab = "create" | "list";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("create");
  const [isRecording, setIsRecording] = useState(false);
  const [, setLoading] = useState(false);
  const [isNaming, setIsNaming] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  useEffect(() => {
    // Check initial status when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(
          activeTab.id,
          { type: "GET_STATUS" },
          (response) => {
            if (chrome.runtime.lastError) return;
            if (response) {
              setIsRecording(response.isRecording);
            }
          },
        );
      }
    });
  }, []);

  useEffect(() => {
    if (activeTab === "list") {
      fetchFiles();
    }
  }, [activeTab]);

  const fetchFiles = async () => {
    setFilesLoading(true);
    setFilesError(null);

    chrome.runtime.sendMessage({ type: "FETCH_FILES" }, (response) => {
      setFilesLoading(false);
      if (chrome.runtime.lastError) {
        setFilesError(chrome.runtime.lastError.message || "Unknown error");
        return;
      }

      if (response && response.success) {
        setFiles(response.files || []);
      } else {
        setFilesError(response?.error || "Failed to fetch files");
      }
    });
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      // If currently recording, stop and ask for name
      setIsNaming(true);
    } else {
      // Start recording
      startRecording();
    }
  };

  const startRecording = () => {
    setLoading(true);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(
          activeTab.id,
          { type: "START_RECORDING" },
          (response) => {
            setLoading(false);
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError);
              return;
            }

            if (response && response.status === "started") {
              setIsRecording(true);
            }
          },
        );
      } else {
        setLoading(false);
      }
    });
  };

  const stopRecordingAndSave = () => {
    setLoading(true);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(
          activeTab.id,
          { type: "STOP_RECORDING", data: { workflowName } },
          (response) => {
            setLoading(false);
            setIsNaming(false);
            setWorkflowName("");
            
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError);
              return;
            }

            if (response && response.status === "stopped") {
              setIsRecording(false);
              // Switch to list tab to show the new file? 
              // Maybe better to stay here or show success message.
              // For now, let's just refresh the list if we were on it (which we aren't)
              setActiveTab("list");
            }
          },
        );
      } else {
        setLoading(false);
      }
    });
  };

  return (
    <div className="flex items-center justify-center p-4 w-[400px]">
      <Card className="w-full shadow-none border-0">
        <div className="flex w-full border-b">
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "create"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("create")}
          >
            Create Workflow
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "list"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("list")}
          >
            Workflows
          </button>
        </div>

        {activeTab === "create" ? (
          <>
            <CardHeader>
              <CardTitle>New Workflow</CardTitle>
              <CardDescription>
                Record a new automation workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Session Recording</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Record your interactions with the page to a JSON file.
                </p>
                
                {!isNaming ? (
                  <Button
                    variant={isRecording ? "destructive" : "default"}
                    className="w-full"
                    onClick={handleToggleRecording}
                  >
                    {isRecording ? "Stop Recording" : "Start Recording"}
                  </Button>
                ) : (
                  <div className="space-y-4 border p-4 rounded-md bg-muted/20">
                    <div className="space-y-2">
                      <Label htmlFor="workflow-name">Workflow Name</Label>
                      <Input 
                        id="workflow-name" 
                        placeholder="e.g., Login Flow" 
                        value={workflowName}
                        onChange={(e) => setWorkflowName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => setIsNaming(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        className="flex-1"
                        onClick={stopRecordingAndSave}
                        disabled={!workflowName.trim()}
                      >
                        Save & Upload
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Existing Workflows</CardTitle>
              <CardDescription>
                Manage your saved automation workflows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filesLoading && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Loading workflows...
                </div>
              )}

              {filesError && (
                <div className="text-center py-4 text-sm text-destructive">
                  Error: {filesError}
                </div>
              )}

              {!filesLoading && !filesError && files.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-md">
                  No workflows found.
                </div>
              )}

              {!filesLoading && !filesError && files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((file, i) => (
                    <li
                      key={i}
                      className="p-3 bg-muted/50 rounded-md text-sm flex items-center justify-between group hover:bg-muted transition-colors"
                    >
                      <span className="truncate max-w-50" title={file}>
                        {file}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4"
                onClick={fetchFiles}
              >
                Refresh List
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
