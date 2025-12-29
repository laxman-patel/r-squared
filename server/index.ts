import { Hono } from "hono";
import { cors } from "hono/cors";
import { join } from "node:path";
import { getAction, type WEC, type StaticFiles } from "./utils/mockAction";

const app = new Hono();

app.use("/*", cors());
const UPLOAD_DIR = "workflow-foundations";

app.get("/", (c) => c.text("Server is running!"));

// Endpoint to upload a file
app.post("/upload", async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });
    
    const workflowId = crypto.randomUUID();
    const workflowDir = join(UPLOAD_DIR, workflowId);
    
    // Use Bun.spawn to create directory (avoiding node:fs)
    await Bun.spawn(["mkdir", "-p", workflowDir]).exited;
    
    const uploadedFiles: string[] = [];

    // Helper to process a value which could be a File, string, or array of them
    const processFile = async (val: string | File | (string | File)[]) => {
      const items = Array.isArray(val) ? val : [val];
      
      for (const item of items) {
        if (item instanceof File) {
           // Bun.write can handle File objects directly
           await Bun.write(join(workflowDir, item.name), item);
           uploadedFiles.push(item.name);
        }
      }
    };

    if (body["file"]) await processFile(body["file"]);
    if (body["screenshots"]) await processFile(body["screenshots"]);

    if (uploadedFiles.length > 0) {
      return c.json({ 
        message: `Successfully uploaded ${uploadedFiles.length} files to workflow ${workflowId}`,
        workflowId,
        files: uploadedFiles 
      });
    }

    return c.json({ error: "No file uploaded or invalid format" }, 400);
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "Upload failed" }, 500);
  }
});

// Endpoint to list all workflows and their files
app.get("/files", async (c) => {
  try {
    const glob = new Bun.Glob("*/*");
    const workflowMap = new Map<string, string[]>();

    // scan returns an async iterator of paths
    for await (const path of glob.scan({ cwd: UPLOAD_DIR })) {
      // path is like "uuid/filename"
      const parts = path.split(/[/\\]/); // Handle both separators just in case
      if (parts.length === 2) {
        const id = parts[0];
        const filename = parts[1];
        
        if (typeof id === 'string' && typeof filename === 'string') {
          if (!workflowMap.has(id)) {
            workflowMap.set(id, []);
          }
          workflowMap.get(id)?.push(filename);
        }
      }
    }

    const workflows = Array.from(workflowMap.entries()).map(([id, files]) => ({
      id,
      files
    }));
    
    return c.json({ workflows });
  } catch (error) {
    console.error("List files error:", error);
    return c.json({ error: "Failed to list files" }, 500);
  }
});

// Endpoint to get a specific file from a workflow
app.get("/files/:id/:filename", async (c) => {
  const id = c.req.param("id");
  const filename = c.req.param("filename");

  if (!id || !filename) {
    return c.json({ error: "Invalid path" }, 400);
  }

  // Security check: prevent directory traversal
  if (
    id.includes("..") || id.includes("/") || id.includes("\\") ||
    filename.includes("..") || filename.includes("/") || filename.includes("\\")
  ) {
    return c.json({ error: "Invalid path" }, 400);
  }

  const filePath = join(UPLOAD_DIR, id, filename);
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return new Response(file);
  }

  return c.json({ error: "File not found" }, 404);
});

console.log(`Server is running on port 3000`);

type WSData = {
  workflowId?: string;
  history: WEC[];
  staticFiles?: StaticFiles;
};

export default {
  port: 3000,
  fetch(req: Request, server: any) {
    if (server.upgrade(req, { data: { history: [] } })) {
      return;
    }
    return app.fetch(req, server);
  },
  websocket: {
    async message(ws: any, message: string | Buffer) {
      try {
        const rawData = typeof message === "string" ? message : new TextDecoder().decode(message);
        const data = JSON.parse(rawData);
        const wsData = ws.data as WSData;

        // If it's the first message, expect workflowId
        if (!wsData.workflowId) {
            if (!data.workflowId || !data.wec) {
                ws.send(JSON.stringify({ error: "First message must contain workflowId and wec" }));
                return;
            }
            wsData.workflowId = data.workflowId;

            // Load static files
            const workflowDir = join(UPLOAD_DIR, data.workflowId);
            const glob = new Bun.Glob("*");
            
            const staticFiles: StaticFiles = {
                jsonl: "",
                images: []
            };

            let foundJsonl = false;

            // Check if directory exists
            // Since Bun.Glob doesn't throw if dir doesn't exist, we can just scan
            // But we should check if any files were found
            
            for await (const filename of glob.scan({ cwd: workflowDir })) {
                const filePath = join(workflowDir, filename);
                const file = Bun.file(filePath);
                
                if (filename.endsWith(".jsonl")) {
                    // Only take the first jsonl if multiple exist (or accumulate? Prompt says "the jsonl file")
                    if (!foundJsonl) {
                        staticFiles.jsonl = await file.text();
                        foundJsonl = true;
                    }
                } else if (/\.(png|jpg|jpeg|gif|webp)$/i.test(filename)) {
                    // Read as base64
                    const buffer = await file.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString("base64");
                    staticFiles.images.push(base64);
                }
            }
            
            if (!foundJsonl) {
                // If not found in subdir, check root if the workflowId actually matches a file in root (edge case from earlier)
                // But following standard path:
                console.warn(`No JSONL file found for workflow ${data.workflowId}`);
                // Proceeding anyway or should error? "we first retrieve the files... "
                // If it fails, maybe return error.
                // ws.send(JSON.stringify({ error: "Workflow files not found" }));
                // return;
            }

            wsData.staticFiles = staticFiles;
            wsData.history.push(data.wec);
        } else {
             // Subsequent messages
             if (!data.wec) {
                 ws.send(JSON.stringify({ error: "Message must contain wec" }));
                 return;
             }
             wsData.history.push(data.wec);
        }

        if (wsData.staticFiles) {
            const result = await getAction(wsData.history, wsData.staticFiles);
            ws.send(JSON.stringify(result));
            
            if (result.is_complete) {
                ws.close();
            }
        } else {
             ws.send(JSON.stringify({ error: "Internal error: Static files not loaded" }));
             ws.close();
        }

      } catch (error) {
        console.error("WebSocket error:", error);
        ws.send(JSON.stringify({ error: "Internal server error" }));
      }
    },
    open(ws: any) {
      console.log("WebSocket connected");
    },
    close(ws: any) {
      console.log("WebSocket disconnected");
    }
  }
};
