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

export class WhisperService {
  private readonly config: WhisperConfig;

  constructor(config: WhisperConfig) {
    this.config = config;
  }

  async transcribe(
    inputFile: string,
    outputBasePath: string,
    onProgress?: (update: TranscriptionProgress) => void
  ): Promise<TranscriptionResult> {
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "whisper-job-"));
    const normalizedInput = path.join(workDir, "normalized.wav");

    try {
      onProgress?.({ stage: "Normalizando audio", progress: 15 });
      await runCommand(
        "ffmpeg",
        ["-y", "-i", inputFile, "-ac", "1", "-ar", "16000", normalizedInput],
        "Erro ao normalizar audio com ffmpeg"
      );

      onProgress?.({ stage: "Transcrevendo audio", progress: 35 });

      const threads = Math.max(2, Math.min(os.cpus().length, 8));
      const args = [
        "-m",
        this.config.modelPath,
        "-l",
        this.config.language,
        "-t",
        threads.toString(),
        "-bo",
        "1",
        "-bs",
        "1",
        "-nt",
        "-f",
        normalizedInput,
        "-otxt",
        "-of",
        outputBasePath
      ];

      await runCommand(this.config.whisperPath, args, "Erro ao executar whisper-cli");

      const outputFile = `${outputBasePath}.txt`;
      if (!fs.existsSync(outputFile)) {
        throw new Error("Arquivo de transcricao nao foi gerado.");
      }

      const transcription = fs.readFileSync(outputFile, "utf-8");
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
