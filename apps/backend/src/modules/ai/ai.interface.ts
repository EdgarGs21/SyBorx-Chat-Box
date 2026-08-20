export interface AIMessageFile {
  mimeType: string;
  data: string; // base64
  name?: string;
}

export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: {
    text?: string;
    files?: AIMessageFile[];
  } | string;
}

export interface AIGenerateOptions {
  history: AIChatMessage[];
  text: string;
  files?: AIMessageFile[];
  model?: string;
  systemInstruction?: string;
}

export interface AIGenerateResult {
  reply: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  latencyMs: number;
}

export interface IProveedorIA {
  generateResponse(opts: AIGenerateOptions): Promise<AIGenerateResult>;
  getAllowedModels(): string[];
  getDefaultModel(): string;
}
