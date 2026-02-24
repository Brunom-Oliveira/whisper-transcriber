import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { buildRoutes } from "./routes";
import { WhisperService } from "./whisper.service";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const uploadsDir = path.resolve(process.cwd(), "uploads");
const outputsDir = path.resolve(process.cwd(), "outputs");

const whisperPath = process.env.WHISPER_PATH || "whisper-cli";
const whisperModel = process.env.WHISPER_MODEL;
const fileTtlMinutes = Number(process.env.FILE_TTL_MINUTES || 120);

if (!whisperModel) {
  throw new Error("Variavel WHISPER_MODEL nao configurada.");
}

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(outputsDir, { recursive: true });

const whisperService = new WhisperService({
  whisperPath,
  modelPath: whisperModel,
  language: "pt"
});

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api", buildRoutes({ uploadsDir, outputsDir, whisperService }));
app.use("/downloads", express.static(outputsDir));

function cleanupOldFiles(): void {
  const ttlMs = fileTtlMinutes * 60 * 1000;
  const now = Date.now();

  for (const dir of [uploadsDir, outputsDir]) {
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > ttlMs) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Ignore cleanup failures for resilience.
      }
    }
  }
}

setInterval(cleanupOldFiles, 30 * 60 * 1000);

app.listen(port, () => {
  console.log(`Backend online na porta ${port}`);
});
