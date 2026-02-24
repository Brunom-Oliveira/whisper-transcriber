import axios from "axios";
import { ChangeEvent, useMemo, useState } from "react";

interface ApiResponse {
  id: string;
  transcription: string;
  downloadUrl: string;
}

const apiBaseUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");

  const fullDownloadUrl = useMemo(() => {
    if (!downloadUrl) return "";
    return `${apiBaseUrl}${downloadUrl}`;
  }, [downloadUrl]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setTranscription("");
    setDownloadUrl("");
    setError("");
  };

  const onTranscribe = async () => {
    if (!file) {
      setError("Selecione um arquivo de audio antes de transcrever.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const formData = new FormData();
      formData.append("audio", file);

      const response = await axios.post<ApiResponse>(`${apiBaseUrl}/api/transcribe`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setTranscription(response.data.transcription);
      setDownloadUrl(response.data.downloadUrl);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const apiError = err.response?.data?.error;
        setError(apiError || "Falha ao transcrever o audio.");
      } else {
        setError("Erro inesperado ao processar a solicitacao.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app">
      <section className="card">
        <h1>Whisper Transcriber</h1>
        <p className="subtitle">Upload de audio e transcricao local com whisper.cpp</p>

        <input type="file" accept="audio/*" onChange={onFileChange} />

        <button onClick={onTranscribe} disabled={loading}>
          {loading ? "Transcrevendo..." : "Transcrever"}
        </button>

        {loading && <div className="spinner" aria-label="Carregando" />}

        {error && <p className="error">{error}</p>}

        {transcription && (
          <div className="result">
            <h2>Transcricao</h2>
            <pre>{transcription}</pre>
            {fullDownloadUrl && (
              <a href={fullDownloadUrl} download>
                Baixar .txt
              </a>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
