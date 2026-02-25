# whisper-transcriber

Projeto full stack para transcricao de audio usando `whisper.cpp` via CLI, com upload web, exibicao da transcricao e download de `.txt`.

## Estrutura

```text
whisper-transcriber/
├── backend/
├── frontend/
├── docker-compose.yml
└── README.md
```

## Requisitos

- Node.js 20+
- npm 10+
- `whisper.cpp` instalado no servidor/host
- Binario `whisper-cli` acessivel no PATH (ou caminho absoluto)
- Modelo `.bin` do Whisper disponivel

## Configuracao de ambiente

### Backend

1. Copie `backend/.env.example` para `backend/.env`
2. Ajuste os valores:

```env
PORT=3001
WHISPER_PATH=whisper-cli
WHISPER_MODEL=/opt/whisper.cpp/models/ggml-base.bin
FILE_TTL_MINUTES=120
```

Campos:
- `WHISPER_PATH`: caminho/binario do CLI
- `WHISPER_MODEL`: caminho do modelo
- `FILE_TTL_MINUTES`: limpeza automatica de arquivos antigos em `uploads/` e `outputs/`

### Frontend

1. Copie `frontend/.env.example` para `frontend/.env`
2. Ajuste:

```env
REACT_APP_API_URL=http://localhost:3001
```

## Rodar localmente

Na raiz do projeto:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### Executar backend

```bash
cd backend
npm run dev
```

### Executar frontend

Em outro terminal:

```bash
cd frontend
npm start
```

Acessos:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Healthcheck: `GET http://localhost:3001/api/health`

## API

### `POST /api/transcribe`

- Content-Type: `multipart/form-data`
- Campo do arquivo: `audio`

Resposta de sucesso:

```json
{
  "id": "uuid",
  "transcription": "texto completo",
  "downloadUrl": "/downloads/uuid.txt"
}
```

Erros:
- `400` quando arquivo nao enviado
- `500` em falha de execucao do Whisper

## Build

### Backend

```bash
cd backend
npm run build
npm run start
```

### Frontend

```bash
cd frontend
npm run build
```

## Docker

O `docker-compose.yml` sobe:
- Backend na porta `3001`
- Frontend na porta `3000`
- Volume externo para `whisper.cpp`

### Configurar caminho do whisper.cpp no host

No shell, antes de subir:

```bash
export WHISPER_HOST_PATH=/caminho/no/host/whisper.cpp
export REACT_APP_API_URL=http://SEU_IP_OU_DOMINIO:3001
```

No Windows PowerShell:

```powershell
$env:WHISPER_HOST_PATH="C:\caminho\whisper.cpp"
$env:REACT_APP_API_URL="http://SEU_IP_OU_DOMINIO:3001"
```

### Subir com Docker

```bash
docker compose up --build -d
```

### Logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## Deploy em VPS (resumo)

1. Instale Docker e Docker Compose na VPS.
2. Clone o repositorio.
3. Configure `backend/.env` com `WHISPER_PATH` e `WHISPER_MODEL` corretos da VPS.
4. Exporte `WHISPER_HOST_PATH` apontando para o diretório do `whisper.cpp` na VPS.
5. Rode:

```bash
docker compose up --build -d
```

6. Configure Nginx/Caddy como reverse proxy para `3000` (frontend) e, se necessario, `3001` (API).

## Observacoes de arquitetura

- O backend usa `spawn` para executar `whisper-cli` sem bloqueio do event loop.
- A pasta `outputs/` e servida em `/downloads` para baixar os `.txt`.
- Existe estrutura inicial para evolucao para fila assíncrona em `backend/src/queue.ts`.
- Limpeza automatica periodica remove arquivos antigos para evitar crescimento infinito de disco.

## Docker (VPS - build estavel)

Nesta versao, o backend compila e empacota o `whisper-cli` dentro da imagem Docker.
No host, apenas os modelos sao montados em modo leitura.

`docker-compose.yml`:
- Backend publicado em `4001:3001`
- Frontend publicado em `3000:3000`
- Volume de modelos: `/root/whisper.cpp/models:/opt/whisper/models:ro`

Backend `.env`:

```env
PORT=3001
WHISPER_PATH=/opt/whisper/bin/whisper-cli
WHISPER_MODEL=/opt/whisper/models/ggml-base.bin
FILE_TTL_MINUTES=120
```

Subida recomendada:

```bash
docker-compose down --remove-orphans
docker-compose up -d --build --force-recreate
```
