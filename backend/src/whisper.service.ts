import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export interface TranscriptionResult {
  transcription: string;
  outputFile: string;
}

export interface TranscriptionProgress {
  stage: string;
  progress: number;
}

interface WhisperConfig {
  whisperPath: string;
  modelPath: string;
  language: string;
}

function runCommand(command: string, args: string[], errPrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`${errPrefix}: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${errPrefix}: codigo ${code}. ${stderr}`.trim()));
        return;
      }
      resolve();
    });
  });
}

async function collectChunkFiles(chunksDir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(chunksDir);
  return entries
    .filter((name) => name.endsWith(".wav"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(chunksDir, name));
}

export class WhisperService {
  private readonly config: WhisperConfig;

  constructor(config: WhisperConfig) {
    this.config = config;
  }

  async transcribe(
    inputFile: string,
    outputBasePath: string,
    onProgress?: (update: TranscriptionProgress) => void,
    fullAudio: boolean = false
  ): Promise<TranscriptionResult> {
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "whisper-job-"));
    const normalizedInput = path.join(workDir, "normalized.wav");
    const chunksDir = path.join(workDir, "chunks");
    const partialDir = path.join(workDir, "partial");

    try {
      await fs.promises.mkdir(chunksDir, { recursive: true });
      await fs.promises.mkdir(partialDir, { recursive: true });

      // Normaliza audio para mono 16k e limita aos primeiros 6 minutos (360s) para performance.
      onProgress?.({ stage: "Normalizando audio", progress: 10 });
      const ffmpegArgs = ["-y"];
      if (!fullAudio) {
        ffmpegArgs.push("-t", "360");
      }
      ffmpegArgs.push("-i", inputFile, "-ac", "1", "-ar", "16000", normalizedInput);

      await runCommand(
        "ffmpeg",
        ffmpegArgs,
        "Erro ao normalizar audio com ffmpeg"
      );

      // Segmenta em blocos maiores (120s) para reduzir o overhead de carregar o modelo na RAM repetidamente.
      onProgress?.({ stage: "Segmentando audio", progress: 20 });
      const segmentPattern = path.join(chunksDir, "chunk_%03d.wav");
      await runCommand(
        "ffmpeg",
        [
          "-y",
          "-i",
          normalizedInput,
          "-af",
          "silenceremove=stop_periods=-1:stop_duration=0.7:stop_threshold=-35dB",
          "-f",
          "segment",
          "-segment_time",
          "120",
          "-c:a",
          "pcm_s16le",
          "-ar",
          "16000",
          "-ac",
          "1",
          segmentPattern
        ],
        "Erro ao segmentar audio com ffmpeg"
      );

      const chunks = await collectChunkFiles(chunksDir);
      if (chunks.length === 0) {
        throw new Error("Nenhum bloco de audio foi gerado para transcricao.");
      }

      const parts: string[] = new Array(chunks.length).fill("");
      onProgress?.({ stage: "Transcrevendo blocos (Alta Velocidade)", progress: 25 });

      // Configuração de concorrência: Menos processos simultâneos, mas cada um com mais poder de CPU.
      const cpuCores = os.cpus().length;
      const concurrency = Math.max(1, Math.min(chunks.length, 2)); // Limita a 2 processos para não saturar I/O de disco
      const threadsPerProcess = Math.max(4, Math.floor(cpuCores / concurrency));

      let completedChunks = 0;
      const queue = [...chunks.keys()];

      const worker = async () => {
        while (queue.length > 0) {
          const index = queue.shift();
          if (index === undefined) break;

          const chunkFile = chunks[index];
          const partBase = path.join(partialDir, `part_${String(index).padStart(3, "0")}`);

          // Removidos acentos e caracteres especiais para evitar erro de parsing no CLI
          const initialPrompt = "Suporte tecnico sistema WMS Conquista empresa Salog. Termos: Picking Expresso, bipar, SKU, enderecamento, inventario, rotina B22, mercadoria, AnyDesk, WhatsApp.";

          const args = [
            "-m", this.config.modelPath,
            "-l", this.config.language,
            "-t", threadsPerProcess.toString(),
            "--prompt", initialPrompt,
            "-bs", "2", // Beam search reduzido para velocidade (2 é um bom equilíbrio)
            "-nt", // No Timestamps: acelera o processamento
            "-f", chunkFile,
            "-otxt",
            "-of", partBase
          ];

          await runCommand(this.config.whisperPath, args, `Erro no bloco ${index + 1}`);

          const partTxt = `${partBase}.txt`;
          if (fs.existsSync(partTxt)) {
            parts[index] = fs.readFileSync(partTxt, "utf-8").trim();
          }

          completedChunks++;
          const chunkProgress = 25 + Math.round((completedChunks / chunks.length) * 65);
          onProgress?.({ stage: `Transcrevendo (${completedChunks}/${chunks.length})`, progress: chunkProgress });
        }
      };

      // Inicia o pool de workers paralelos
      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);

      const outputFile = `${outputBasePath}.txt`;
      const transcription = parts.join("\n");
      fs.writeFileSync(outputFile, transcription, "utf-8");
      onProgress?.({ stage: "Finalizando", progress: 98 });

      return {
        transcription,
        outputFile: path.resolve(outputFile)
      };
    } finally {
      fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
