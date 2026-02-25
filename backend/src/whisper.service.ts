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

  async transcribe(inputFile: string, outputBasePath: string): Promise<TranscriptionResult> {
    const normalizedInput = `${outputBasePath}.normalized.wav`;

    // Normaliza audio para mono 16k para reduzir ruído e melhorar consistencia da transcricao.
    await runCommand(
      "ffmpeg",
      ["-y", "-i", inputFile, "-ac", "1", "-ar", "16000", normalizedInput],
      "Erro ao normalizar audio com ffmpeg"
    );

    const args = [
      "-m",
      this.config.modelPath,
      "-l",
      this.config.language,
      "-f",
      normalizedInput,
      "-otxt",
      "-of",
      outputBasePath,
      "--vad",
      "-nth",
      "0.7",
      "-et",
      "2.0",
      "-lpt",
      "-0.5"
    ];

    await runCommand(this.config.whisperPath, args, "Erro ao executar whisper-cli");

    const outputFile = `${outputBasePath}.txt`;
    if (!fs.existsSync(outputFile)) {
      throw new Error("Arquivo de transcricao nao foi gerado.");
    }

    const transcription = fs.readFileSync(outputFile, "utf-8");
    fs.promises.unlink(normalizedInput).catch(() => undefined);

    return {
      transcription,
      outputFile: path.resolve(outputFile)
    };
  }
}
