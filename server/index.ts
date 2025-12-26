import { Hono } from "hono";
import { cors } from "hono/cors";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const app = new Hono();

app.use("/*", cors());
const UPLOAD_DIR = "workflow-foundations";

app.get("/", (c) => c.text("Server is running!"));

// Endpoint to upload a file
app.post("/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];
    console.log({ file });

    if (file instanceof File) {
      const buffer = await file.arrayBuffer();
      // Using Buffer.from to be compatible with node fs, though Bun might handle ArrayBuffer directly
      await writeFile(join(UPLOAD_DIR, file.name), Buffer.from(buffer));
      return c.json({ message: `File ${file.name} uploaded successfully` });
    }

    return c.json({ error: "No file uploaded or invalid format" }, 400);
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "Upload failed" }, 500);
  }
});

// Endpoint to list all files
app.get("/files", async (c) => {
  try {
    const files = await readdir(UPLOAD_DIR);
    return c.json({ files });
  } catch (error) {
    console.error("List files error:", error);
    // If directory doesn't exist, we might return empty list or error.
    // Assuming directory exists as I created it.
    return c.json({ error: "Failed to list files" }, 500);
  }
});

// Endpoint to get a specific file
app.get("/files/:filename", async (c) => {
  const filename = c.req.param("filename");

  // Security check: prevent directory traversal
  if (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    return c.json({ error: "Invalid filename" }, 400);
  }

  const filePath = join(UPLOAD_DIR, filename);
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return new Response(file);
  }

  return c.json({ error: "File not found" }, 404);
});

console.log(`Server is running on port 3000`);

export default {
  port: 3000,
  fetch: app.fetch,
};
