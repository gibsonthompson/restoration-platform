import Anthropic from '@anthropic-ai/sdk';

// Single shared client. Key from env, server-side only.
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

// Cost discipline (standing rule): Haiku for extraction/drafts, Sonnet for final output.
export const MODELS = {
  draft: 'claude-haiku-4-5-20251001',
  final: 'claude-sonnet-4-6'
} as const;
