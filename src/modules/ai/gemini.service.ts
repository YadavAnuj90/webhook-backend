
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const DEEPSEEK_BASE    = 'https://api.deepseek.com';
const DEEPSEEK_MODEL   = 'deepseek-chat';

const GEMINI_BASE      = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL     = 'gemini-2.0-flash';

export { AiProviderService as GeminiService };

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger('AiProviderService');

  constructor(private readonly config: ConfigService) {}

  get provider(): 'deepseek' | 'gemini' | 'none' {
    if (this.config.get<string>('DEEPSEEK_API_KEY')) return 'deepseek';
    if (this.config.get<string>('GEMINI_API_KEY'))   return 'gemini';
    return 'none';
  }

  get providerLabel(): string {
    return this.provider === 'deepseek' ? 'DeepSeek V3'
         : this.provider === 'gemini'   ? 'Gemini 2.0 Flash'
         :                                'None';
  }

  private assertConfigured() {
    if (this.provider === 'none') {
      throw new Error(
        'No AI API key configured. Set DEEPSEEK_API_KEY or GEMINI_API_KEY in your .env',
      );
    }
  }

  async ask(prompt: string, temperature = 0.3): Promise<string> {
    this.assertConfigured();
    return this.provider === 'deepseek'
      ? this.deepseekAsk(prompt, temperature)
      : this.geminiAsk(prompt, temperature);
  }

  async askJson<T = any>(prompt: string, temperature = 0.2): Promise<T> {
    this.assertConfigured();
    return this.provider === 'deepseek'
      ? this.deepseekAskJson<T>(prompt, temperature)
      : this.geminiAskJson<T>(prompt, temperature);
  }

  private async deepseekAsk(prompt: string, temperature: number): Promise<string> {
    const key = this.config.get<string>('DEEPSEEK_API_KEY')!;
    try {
      const res = await axios.post(
        `${DEEPSEEK_BASE}/v1/chat/completions`,
        {
          model: DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: 4096,
          stream: false,
        },
        {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: 45_000,
        },
      );
      return res.data?.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      this.logger.error(`DeepSeek API error: ${err.message}`);
      throw new Error(`DeepSeek API failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  private async deepseekAskJson<T>(prompt: string, temperature: number): Promise<T> {
    const key = this.config.get<string>('DEEPSEEK_API_KEY')!;
    const systemPrompt =
      'You are a precise JSON generator. Always respond with valid JSON only — ' +
      'no markdown, no code fences, no explanation. Just the raw JSON object.';
    try {
      const res = await axios.post(
        `${DEEPSEEK_BASE}/v1/chat/completions`,
        {
          model: DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: prompt },
          ],
          temperature,
          max_tokens: 8192,
          response_format: { type: 'json_object' },
          stream: false,
        },
        {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: 45_000,
        },
      );
      const raw = res.data?.choices?.[0]?.message?.content || '{}';
      return JSON.parse(this.stripFences(raw)) as T;
    } catch (err: any) {
      this.logger.error(`DeepSeek JSON error: ${err.message}`);
      throw new Error(`DeepSeek API failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  private async geminiAsk(prompt: string, temperature: number): Promise<string> {
    const key = this.config.get<string>('GEMINI_API_KEY')!;
    const url  = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`;
    try {
      const res = await axios.post(
        url,
        { contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 4096 } },
        { timeout: 30_000 },
      );
      return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err: any) {
      this.logger.error(`Gemini API error: ${err.message}`);
      throw new Error(`Gemini API failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  private async geminiAskJson<T>(prompt: string, temperature: number): Promise<T> {
    const key = this.config.get<string>('GEMINI_API_KEY')!;
    const url  = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`;
    try {
      const res = await axios.post(
        url,
        { contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 8192,
                              responseMimeType: 'application/json' } },
        { timeout: 30_000 },
      );
      const raw = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(this.stripFences(raw)) as T;
    } catch (err: any) {
      this.logger.error(`Gemini JSON error: ${err.message}`);
      throw new Error(`Gemini API failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  private stripFences(raw: string): string {
    return raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  }
}
