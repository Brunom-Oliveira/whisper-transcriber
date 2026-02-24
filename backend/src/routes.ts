import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { WhisperService } from "./whisper.service";

interface RouteDeps {
  uploadsDir: string;
  outputsDir: string;
  whisperService: WhisperService;
}

export function buildRoutes(deps: RouteDeps): Router {
  const router = Router();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, deps.uploadsDir),
    filename: (_req, file, cb) => {
      const id = uuidv4();
      const ext = path.extname(file.originalname) || ".wav";
      cb(null, `${id}${ext}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 1024 * 1024 * 200 }
  });

  router.post("/transcribe", upload.single("audio"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Arquivo de audio e obrigatorio no campo 'audio'." });
      return;
    }

    const id = uuidv4();
    const inputFile = req.file.path;
    const outputBasePath = path.join(deps.outputsDir, id);

    try {
      const result = await deps.whisperService.transcribe(inputFile, outputBasePath);
      res.status(200).json({
        id,
        transcription: result.transcription,
        downloadUrl: `/downloads/${id}.txt`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido na transcricao.";
      res.status(500).json({ error: message });
    } finally {
      fs.promises.unlink(inputFile).catch(() => undefined);
    }
  });

  return router;
}
