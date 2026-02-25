import fs from "node:fs";
import os from "node:os";
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

  async transcribe(inputFile: string, outputBasePath: string): Promise<TranscriptionResult> {
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "whisper-job-"));
    const normalizedInput = path.join(workDir, "normalized.wav");
    const chunksDir = path.join(workDir, "chunks");
    const partialDir = path.join(workDir, "partial");

    try {
      await fs.promises.mkdir(chunksDir, { recursive: true });
      await fs.promises.mkdir(partialDir, { recursive: true });

      // Normaliza audio para mono 16k para melhorar a consistencia da transcricao.
      await runCommand(
        "ffmpeg",
        ["-y", "-i", inputFile, "-ac", "1", "-ar", "16000", normalizedInput],
        "Erro ao normalizar audio com ffmpeg"
      );

      // Remove silencios longos e segmenta em blocos de 120s para acelerar audio extenso.
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

      const parts: string[] = [];

      for (let i = 0; i < chunks.length; i += 1) {
        const chunkFile = chunks[i];
        const partBase = path.join(partialDir, `part_${String(i).padStart(3, "0")}`);

        const args = [
          "-m",
          this.config.modelPath,
          "-l",
          this.config.language,
          "-t",
          "8",
          "-bo",
          "1",
          "-bs",
          "1",
          "-f",
          chunkFile,
          "-otxt",
          "-of",
          partBase,
          "-nth",
          "0.7",
          "-et",
          "2.0",
          "-lpt",
          "-0.5"
        ];

        await runCommand(this.config.whisperPath, args, "Erro ao executar whisper-cli");

        const partTxt = `${partBase}.txt`;
        if (!fs.existsSync(partTxt)) {
          throw new Error(`Arquivo de transcricao do bloco ${i + 1} nao foi gerado.`);
        }

        const text = fs.readFileSync(partTxt, "utf-8").trim();
        if (text) {
          parts.push(text);
        }
      }

      const outputFile = `${outputBasePath}.txt`;
      const transcription = parts.join("\n");
      fs.writeFileSync(outputFile, transcription, "utf-8");

      return {
        transcription,
        outputFile: path.resolve(outputFile)
      };
    } finally {
      fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
