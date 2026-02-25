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

    const fullAudio = req.body.fullAudio === "true" || req.body.fullAudio === true;

    (async () => {
      try {
        job.status = "processing";
        job.progress = 5;
        job.stage = "Iniciando";
        job.startedAt = new Date();

        const result = await deps.whisperService.transcribe(inputFile, outputBasePath, (update) => {
          job.progress = Math.max(0, Math.min(99, update.progress));
          job.stage = update.stage;
        }, fullAudio);

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

  router.post("/refine", async (req, res) => {
    const { text } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      res.status(500).json({ error: "GROQ_API_KEY nao configurada no servidor." });
      return;
    }

    if (!text) {
      res.status(400).json({ error: "Texto e obrigatorio para refinamento." });
      return;
    }

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "Você é um especialista em suporte técnico do sistema WMS Conquista da empresa Salog. Sua tarefa é corrigir transcrições de áudio de call center. \n\nRegras:\n1. Corrija termos técnicos: 'Saló' -> 'Salog', 'FIC Impressor' -> 'Picking Expresso', 'pipar' -> 'bipar', 'metadoria' -> 'mercadoria'.\n2. Formate o texto como um diálogo claro entre 'Técnico' e 'Cliente'.\n3. Remova vícios de linguagem excessivos, mas mantenha o sentido original.\n4. Corrija a pontuação e gramática.\n5. Se houver códigos (como D3402, B22), mantenha-os corretamente."
            },
            {
              role: "user",
              content: `Refine esta transcrição:\n\n${text}`
            }
          ],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Erro na API da Groq");
      }

      const data = await response.json();
      const refinedText = data.choices[0]?.message?.content;

      res.status(200).json({ refinedText });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao refinar texto.";
      res.status(500).json({ error: message });
    }
  });

  router.post("/summarize", async (req, res) => {
    const { text } = req.body;
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      res.status(500).json({ error: "GROQ_API_KEY nao configurada." });
      return;
    }

    if (!text) {
      res.status(400).json({ error: "Texto e obrigatorio para o resumo." });
      return;
    }

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: `Você é um assistente de suporte sênior. Sua tarefa é criar um resumo técnico profissional para ser inserido no sistema de tickets MantisBT.
              
              Instruções obrigatórias:
              1. Identifique o nome do TÉCNICO da R3 que realizou o atendimento através do diálogo.
              2. Formate o texto final exatamente como o padrão abaixo:
              
              ---
              EMPRESA: [Nome da Empresa, ex: Salog]
              CLIENTE: [Nome do Cliente que solicitou o suporte]
              ATENDENTE: [Nome do Técnico da R3 que atendeu]
              
              RESUMO DO CASO:
              [Descreva de forma técnica o problema relatado e as ações que foram realizadas para resolvê-lo ou mitigá-lo]
              ---
              
              Use termos técnicos do WMS Conquista (Picking Expresso, bipagem, SKU, B22, faturamento, etc).`
            },
            {
              role: "user",
              content: `Gere o resumo para o MantisBT desta transcrição:\n\n${text}`
            }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error("Erro na API da Groq durante o resumo.");
      }

      const data = await response.json();
      const summary = data.choices[0]?.message?.content;

      res.status(200).json({ summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao gerar resumo.";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
