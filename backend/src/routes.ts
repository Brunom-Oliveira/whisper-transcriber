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

type JobStatus = "queued" | "processing" | "completed" | "failed";

interface TranscriptionJob {
  id: string;
  status: JobStatus;
  progress: number;
  stage: string;
  startedAt?: Date;
  completedAt?: Date;
  transcription?: string;
  downloadUrl?: string;
  error?: string;
}

export function buildRoutes(deps: RouteDeps): Router {
  const router = Router();
  const jobs = new Map<string, TranscriptionJob>();

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
    const job: TranscriptionJob = {
      id,
      status: "queued",
      progress: 0,
      stage: "Na fila"
    };
    jobs.set(id, job);

    res.status(202).json({
      id,
      statusUrl: `/api/transcribe/${id}`
    });

    (async () => {
      try {
        job.status = "processing";
        job.progress = 5;
        job.stage = "Iniciando";
        job.startedAt = new Date();

        const result = await deps.whisperService.transcribe(inputFile, outputBasePath, (update) => {
          job.progress = Math.max(0, Math.min(99, update.progress));
          job.stage = update.stage;
        });

        job.status = "completed";
        job.progress = 100;
        job.stage = "Concluido";
        job.completedAt = new Date();
        job.transcription = result.transcription;
        job.downloadUrl = `/downloads/${id}.txt`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido na transcricao.";
        job.status = "failed";
        job.progress = 100;
        job.stage = "Falha";
        job.completedAt = new Date();
        job.error = message;
      } finally {
        fs.promises.unlink(inputFile).catch(() => undefined);
      }
    })();
  });

  router.get("/transcribe/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Transcricao nao encontrada." });
      return;
    }

    res.status(200).json(job);
  });

  return router;
}
