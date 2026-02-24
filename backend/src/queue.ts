export interface TranscriptionJob {
  id: string;
  inputFilePath: string;
  outputBasePath: string;
}

// Placeholder para evoluir para processamento assíncrono (fila real)
// com BullMQ, RabbitMQ ou outra estratégia.
export class InMemoryTranscriptionQueue {
  async enqueue(job: TranscriptionJob): Promise<TranscriptionJob> {
    return job;
  }
}
