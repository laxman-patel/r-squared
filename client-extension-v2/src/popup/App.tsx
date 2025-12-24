import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check initial status when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        // We use a try-catch pattern with chrome.runtime.lastError in the callback
        // to handle pages where the content script hasn't injected (e.g. chrome:// urls)
        chrome.tabs.sendMessage(
          activeTab.id,
          { type: "GET_STATUS" },
          (response) => {
            if (chrome.runtime.lastError) {
              // Content script not ready or not allowed
              return;
            }
            if (response) {
              setIsRecording(response.isRecording);
            }
          },
        );
      }
    });
  }, []);

  const handleToggleRecording = () => {
    setLoading(true);
    const action = isRecording ? "STOP_RECORDING" : "START_RECORDING";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, { type: action }, (response) => {
          setLoading(false);
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
          }

          if (response) {
            if (response.status === "started") setIsRecording(true);
            if (response.status === "stopped") setIsRecording(false);
          }
        });
      } else {
        setLoading(false);
      }
    });
  };

  return (
    <div className="flex items-center justify-center p-4">
      <Card className="w-[350px] shadow-none border-0">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Configure your extension preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" placeholder="user@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Personal Notes</Label>
            <Textarea id="notes" placeholder="Type your notes here..." />
          </div>

          <Separator className="my-4" />

          <div className="space-y-2">
            <Label>Session Recording</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Record your interactions with the page to a JSON file.
            </p>
            <Button
              variant={isRecording ? "destructive" : "default"}
              className="w-full"
              onClick={handleToggleRecording}
              disabled={false}
            >
              {isRecording ? "Stop Recording & Save" : "Start Recording"}
            </Button>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="w-full">
            Save Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
