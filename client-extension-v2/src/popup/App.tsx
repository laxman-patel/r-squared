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
import { PlayCircleIcon, StopCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ActionPayload, WSResponse, WECMessage } from "@/lib/types";

type Tab = "create" | "list";

interface Workflow {
  workflow_name: string;
  workflow_id: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("create");
  const [isRecording, setIsRecording] = useState(false);
  const [, setLoading] = useState(false);
  const [isNaming, setIsNaming] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [files, setFiles] = useState<Workflow[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [userPrompt, setUserPrompt] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<"idle" | "connecting" | "executing" | "completed" | "error">("idle");
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);

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
      console.log("[Popup] FETCH_FILES response:", response);
      setFilesLoading(false);
      if (chrome.runtime.lastError) {
        setFilesError(chrome.runtime.lastError.message || "Unknown error");
        return;
      }

      if (response && response.success) {
        console.log("[Popup] Files data:", response.files);
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

  const startWorkflowExecution = async () => {
    if (!selectedWorkflow) return;

    setIsExecuting(true);
    setExecutionStatus("connecting");
    setExecutionLog([]);
    setExecutionError(null);
    setSelectedWorkflow(null);

    try {
      const activeTab = await getActiveTab();
      if (!activeTab.id) throw new Error("No active tab found");

      const tabId = activeTab.id;
      const initialContext = await captureWebContextFromTab(tabId);

      const ws = new WebSocket("ws://localhost:3000");
      setWsConnection(ws);

      ws.onopen = () => {
        setExecutionStatus("executing");
        setExecutionLog((prev) => [...prev, "Connected to backend"]);

        ws.send(JSON.stringify({
          workflowId: selectedWorkflow.workflow_id,
          userPrompt: userPrompt || "",
          wec: initialContext
        } satisfies WECMessage));
      };

      ws.onmessage = async (event) => {
        const response: WSResponse = JSON.parse(event.data);

        if (response.data?.reasoning) {
          setExecutionLog((prev) => [...prev, `📋 ${response.data.reasoning}`]);
        }

        if (response.is_complete) {
          setExecutionStatus("completed");
          setExecutionLog((prev) => [...prev, "✅ Workflow completed successfully"]);
          ws.close();
          return;
        }

        const result = await executeActionWithRetry(tabId, response.data, 3);

        if (result.success) {
          setExecutionLog((prev) => [...prev, `▶️ ${response.data.action_type}: ${response.data.selector}`]);

          await sleep(1000);

          const newContext = await captureWebContextFromTab(tabId);

          ws.send(JSON.stringify({ wec: newContext } satisfies WECMessage));
        } else {
          throw new Error(`Execution failed: ${result.error}`);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setExecutionStatus("error");
        setExecutionError("Connection error occurred");
      };

      ws.onclose = () => {
        setWsConnection(null);
      };

    } catch (error) {
      setIsExecuting(false);
      setExecutionStatus("error");
      setExecutionError(error instanceof Error ? error.message : "Unknown error");
    }
  };

  const stopWorkflowExecution = () => {
    if (wsConnection) {
      wsConnection.close();
      setWsConnection(null);
    }
    setIsExecuting(false);
    setExecutionStatus("error");
    setExecutionLog((prev) => [...prev, "⏹️ Workflow stopped by user"]);
  };

  const executeActionWithRetry = async (
    tabId: number,
    action: ActionPayload,
    maxRetries: number
  ): Promise<{ success: boolean; data: string; error?: string }> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await executeActionInTab(tabId, action);
        if (result.success) {
          return { success: true, data: result.result };
        }
        throw new Error(result.error || "Unknown execution error");
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        await sleep(500);
      }
    }
    return { success: false, data: "", error: "Max retries exceeded" };
  };

  const captureWebContextFromTab = async (tabId: number): Promise<{ jsonl: string; image: string }> => {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: "CAPTURE_WEBCONTEXT" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response) {
          resolve(response);
        } else {
          reject(new Error("No response from content script"));
        }
      });
    });
  };

  const executeActionInTab = async (
    tabId: number,
    action: ActionPayload
  ): Promise<{ success: boolean; result: string; error?: string }> => {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: "EXECUTE_ACTION", action }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response) {
          resolve(response);
        } else {
          reject(new Error("No response from content script"));
        }
      });
    });
  };

  const getActiveTab = () => {
    return new Promise<chrome.tabs.Tab>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]);
      });
    });
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
                  {files.map((file) => (
                    <li
                      key={file.workflow_id}
                      className="p-3 bg-muted/50 rounded-md text-sm flex items-center justify-between group hover:bg-muted transition-colors"
                    >
                      <span
                        className="truncate max-w-50"
                        title={file.workflow_name}
                      >
                        {file.workflow_name.split(".")[0]}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSelectedWorkflow(file)}
                        disabled={isExecuting}
                      >
                        <HugeiconsIcon icon={PlayCircleIcon} strokeWidth={2} />
                      </Button>
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

              <AlertDialog open={!!selectedWorkflow && executionStatus === "idle"} onOpenChange={(open) => !open && setSelectedWorkflow(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Execute Workflow</AlertDialogTitle>
                    <AlertDialogDescription>
                      Running: {selectedWorkflow?.workflow_name}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-4">
                    <Label htmlFor="user-prompt">Your Input</Label>
                    <Textarea
                      id="user-prompt"
                      placeholder="Describe what you want to accomplish..."
                      value={userPrompt}
                      onChange={(e) => setUserPrompt(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setUserPrompt("")}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={() => startWorkflowExecution()}>
                      Execute
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {isExecuting && (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                      <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                      <span>
                        {executionStatus === "connecting" ? "Connecting to backend..." :
                         executionStatus === "executing" ? "Executing workflow..." :
                         executionStatus === "completed" ? "Workflow completed!" :
                         "Error occurred"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={stopWorkflowExecution}
                    >
                      <HugeiconsIcon icon={StopCircleIcon} strokeWidth={2} className="text-destructive" />
                    </Button>
                  </div>
                  {executionLog.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-1.5 max-h-40 overflow-y-auto">
                      {executionLog.map((log, i) => (
                        <div key={i} className="pl-2 border-l-2 border-blue-300 dark:border-blue-700">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {executionError && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive flex items-start gap-2">
                  <HugeiconsIcon icon={StopCircleIcon} strokeWidth={2} className="shrink-0" />
                  <span>{executionError}</span>
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
