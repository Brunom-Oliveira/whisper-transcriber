import axios from "axios";
import { ChangeEvent, useMemo, useState } from "react";

interface StartResponse {
  id: string;
  statusUrl: string;
  attendantName?: string;
}

interface StatusResponse {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stage: string;
  attendantName?: string;
  startedAt?: string;
  completedAt?: string;
  transcription?: string;
  downloadUrl?: string;
  error?: string;
}

const apiBaseUrl = process.env.REACT_APP_API_URL || "http://localhost:4001";

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("");
  const [transcription, setTranscription] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");
  const [times, setTimes] = useState<{ start?: string; end?: string }>({});
  const [isRefining, setIsRefining] = useState(false);
  const [summary, setSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [fullAudio, setFullAudio] = useState(false);
  const [attendantName, setAttendantName] = useState("");

  const fullDownloadUrl = useMemo(() => {
    if (!downloadUrl) return "";
    return `${apiBaseUrl}${downloadUrl}`;
  }, [downloadUrl]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setTranscription("");
    setSummary("");
    setDownloadUrl("");
    setError("");
    setProgress(0);
    setProgressStage("");
  };

  const onSummarize = async (textToSummarize: string) => {
    try {
      setIsSummarizing(true);
      const response = await axios.post<{ summary: string }>(`${apiBaseUrl}/api/summarize`, {
        text: textToSummarize,
        attendantName
      });
      setSummary(response.data.summary);
    } catch (err) {
      setError("Erro ao gerar resumo técnico.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const onRefine = async () => {
    if (!transcription) return;

    try {
      setIsRefining(true);
      setError("");
      const response = await axios.post<{ refinedText: string }>(`${apiBaseUrl}/api/refine`, {
        text: transcription,
        attendantName
      });
      setTranscription(response.data.refinedText);
      // Removida geração automática de resumo para manter ação manual
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || "Falha ao refinar texto.");
      } else {
        setError("Erro ao processar refinamento.");
      }
    } finally {
      setIsRefining(false);
    }
  };

  const onTranscribe = async () => {
    if (!file) {
      setError("Selecione um arquivo de audio antes de transcrever.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setTranscription("");
      setDownloadUrl("");
      setSummary("");
      setProgress(0);
      setProgressStage("Enviando arquivo");

      const formData = new FormData();
      formData.append("audio", file);
      formData.append("fullAudio", String(fullAudio));

      const start = await axios.post<StartResponse>(`${apiBaseUrl}/api/transcribe`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? 1));
          setProgress(percentCompleted);
          if (percentCompleted < 100) {
            setProgressStage(`Enviando: ${percentCompleted}%`);
          } else {
            setProgressStage("Processando no servidor...");
          }
        }
      });
      setAttendantName(start.data.attendantName || "");

      let done = false;
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusResponse = await axios.get<StatusResponse>(`${apiBaseUrl}${start.data.statusUrl}`);
        const data = statusResponse.data;

        setProgress(data.progress ?? 0);
        setProgressStage(data.stage || "Processando");
        
        if (data.startedAt || data.completedAt) {
          setTimes({ start: data.startedAt, end: data.completedAt });
        }
        if (data.attendantName) {
          setAttendantName(data.attendantName);
        }

        if (data.status === "completed") {
          setTranscription(data.transcription || "");
          setDownloadUrl(data.downloadUrl || "");
          done = true;
        } else if (data.status === "failed") {
          throw new Error(data.error || "Falha ao transcrever o audio.");
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const apiError = err.response?.data?.error;
        setError(apiError || "Falha ao enviar arquivo ou processar transcricao.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Erro inesperado ao processar a solicitacao.");
      }
      setProgress(0);
      setProgressStage("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app">
      <section className="card">
        <h1>Whisper Transcriber</h1>
        <p className="subtitle">Upload de audio e transcricao local com whisper.cpp</p>

        <div style={{ marginBottom: '20px' }}>
          <input type="file" accept="audio/*" onChange={onFileChange} />
        </div>

        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <input 
            type="checkbox" 
            id="fullAudio"
            checked={fullAudio} 
            onChange={(e) => setFullAudio(e.target.checked)} 
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <label htmlFor="fullAudio" style={{ cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
            Transcrever áudio completo (desativa limite de 6 min)
          </label>
        </div>

        <button 
          onClick={onTranscribe} 
          disabled={loading || !file} 
          className="transcribe-btn"
          style={{ width: '100%', padding: '12px', fontSize: '16px' }}
        >
          {loading ? "Processando..." : "Iniciar Transcrição"}
        </button>

        {loading && (
          <div className="progress-container">
            <div className="progress-wrap">
              <div className="progress-head">
                <span>{progressStage || "Processando"}</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {transcription && (
          <div className="result">
            <div className="result-header">
              <h2>Transcricao</h2>
              {times.start && (
                <div className="time-info">
                  <span>Início: {new Date(times.start).toLocaleTimeString()}</span>
                  {times.end && (
                    <>
                      <span> • Término: {new Date(times.end).toLocaleTimeString()}</span>
                      <span className="duration">
                        ({Math.round((new Date(times.end).getTime() - new Date(times.start).getTime()) / 1000)}s)
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <pre>{transcription}</pre>

            {summary && (
              <div className="summary-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>📋 Resumo para MantisBT</h3>
                  <button 
                    className="copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(summary);
                      const btn = document.activeElement as HTMLButtonElement;
                      const originalText = btn.innerText;
                      btn.innerText = "✅ Copiado!";
                      setTimeout(() => { btn.innerText = originalText; }, 2000);
                    }}
                  >
                    Copiar
                  </button>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontStyle: 'italic', margin: 0 }}>{summary}</pre>
              </div>
            )}

            <div className="result-actions">
              {fullDownloadUrl && (
                <a href={fullDownloadUrl} download className="download-btn">
                  Baixar .txt
                </a>
              )}
              <button 
                className="refine-btn" 
                onClick={onRefine} 
                disabled={isRefining || isSummarizing}
              >
                {isRefining ? "Refinando..." : "✨ Refinar + Resumo"}
              </button>
              {!summary && transcription && (
                <button 
                  className="summary-btn" 
                  onClick={() => onSummarize(transcription)} 
                  disabled={isSummarizing}
                >
                  {isSummarizing ? "Gerando..." : "📋 Gerar Resumo"}
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
