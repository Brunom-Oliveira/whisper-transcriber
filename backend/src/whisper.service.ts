import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export interface TranscriptionResult {
  transcription: string;
  outputFile: string;
}

interface WhisperConfig {
  whisperPath: string;
  modelPath: string;
  language: string;
}

export class WhisperService {
  private readonly config: WhisperConfig;

  constructor(config: WhisperConfig) {
    this.config = config;
  }

  transcribe(inputFile: string, outputBasePath: string): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      const args = [
        "-m",
        this.config.modelPath,
        "-l",
        this.config.language,
        "-nt",
        "-f",
        inputFile,
        "-of",
        outputBasePath
      ];

      const proc = spawn(this.config.whisperPath, args);

      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err) => {
        reject(new Error(`Erro ao executar whisper-cli: ${err.message}`));
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`whisper-cli finalizou com codigo ${code}. ${stderr}`.trim()));
          return;
        }

        const outputFile = `${outputBasePath}.txt`;
        if (!fs.existsSync(outputFile)) {
          reject(new Error("Arquivo de transcricao nao foi gerado."));
          return;
        }

        const transcription = fs.readFileSync(outputFile, "utf-8");
        resolve({
          transcription,
          outputFile: path.resolve(outputFile)
        });
      });
    });
  }
}
