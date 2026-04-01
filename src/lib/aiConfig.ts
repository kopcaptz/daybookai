// AI Configuration Types and Constants
// All AI requests go through Edge Functions - no client-side keys needed

export type AIProfile = 'economy' | 'fast' | 'balanced' | 'quality' | 'biography';
export type AIProvider = 'lovable' | 'openrouter' | 'minimax';

export interface AIProfileConfig {
  id: AIProfile;
  name: string;
  description: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface AIProviderInfo {
  id: AIProvider;
  name: string;
  description: { ru: string; en: string };
}

export const AI_PROVIDERS: Record<AIProvider, AIProviderInfo> = {
  lovable: {
    id: 'lovable',
    name: 'Lovable AI',
    description: { ru: 'Встроенный AI Gateway', en: 'Built-in AI Gateway' },
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: { ru: 'Доступ к Claude, GPT, Gemini', en: 'Access Claude, GPT, Gemini' },
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    description: { ru: 'MiniMax модели', en: 'MiniMax models' },
  },
};

// Provider-specific model mappings per profile
export const PROVIDER_MODELS: Record<AIProvider, Record<AIProfile, string>> = {
  lovable: {
    economy: 'google/gemini-2.5-flash-lite',
    fast: 'google/gemini-2.5-flash-lite',
    balanced: 'google/gemini-2.5-flash',
    quality: 'google/gemini-2.5-pro',
    biography: 'google/gemini-2.5-pro',
  },
  openrouter: {
    economy: 'google/gemini-2.5-flash-lite',
    fast: 'google/gemini-2.5-flash',
    balanced: 'anthropic/claude-sonnet-4',
    quality: 'anthropic/claude-opus-4',
    biography: 'anthropic/claude-opus-4',
  },
  minimax: {
    economy: 'MiniMax-M2.7-highspeed',
    fast: 'MiniMax-M2.7-highspeed',
    balanced: 'MiniMax-M2.7',
    quality: 'MiniMax-M2.7',
    biography: 'MiniMax-M2.7',
  },
};

// Profile to model mapping - used when calling Edge Function (default: lovable)
export const AI_PROFILES: Record<AIProfile, AIProfileConfig> = {
  economy: {
    id: 'economy',
    name: 'ЭКОНОМ',
    description: 'Минимум токенов, быстрые ответы',
    model: 'google/gemini-2.5-flash-lite',
    maxTokens: 256,
    temperature: 0.7,
  },
  fast: {
    id: 'fast',
    name: 'БЫСТРО',
    description: 'Оптимизировано для скорости',
    model: 'google/gemini-2.5-flash-lite',
    maxTokens: 512,
    temperature: 0.7,
  },
  balanced: {
    id: 'balanced',
    name: 'БАЛАНС',
    description: 'Баланс качества и скорости',
    model: 'google/gemini-2.5-flash',
    maxTokens: 1024,
    temperature: 0.7,
  },
  quality: {
    id: 'quality',
    name: 'КАЧЕСТВО',
    description: 'Максимальное качество ответов',
    model: 'google/gemini-2.5-pro',
    maxTokens: 2048,
    temperature: 0.7,
  },
  biography: {
    id: 'biography',
    name: 'БИОГРАФИЯ ДНЯ',
    description: 'Для генерации биографии',
    model: 'google/gemini-2.5-pro',
    maxTokens: 3072,
    temperature: 0.8,
  },
};

export interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  chatProfile: AIProfile;
  bioProfile: AIProfile;
  strictPrivacy: boolean;
  autoMood: boolean;
  autoMoodLiveSuggestions: boolean;
  autoMoodInheritFromChat: boolean;
  autoMoodAIEnabled: boolean;
  autoMoodAIOnBlur: boolean;
  autoMoodAIOnPause: boolean;
  autoTags: boolean;
  autoScreenshot: boolean;
  autoScreenshotBlurPrivate: boolean;
  openrouterApiKey: string;
  minimaxApiKey: string;
}

// Get the user-provided API key for the current provider
export function getProviderApiKey(provider?: AIProvider): string {
  const settings = loadAISettings();
  const p = provider || settings.provider;
  if (p === 'openrouter') return settings.openrouterApiKey || '';
  if (p === 'minimax') return settings.minimaxApiKey || '';
  return '';
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  provider: 'lovable',
  chatProfile: 'balanced',
  bioProfile: 'biography',
  strictPrivacy: true,
  autoMood: true,
  autoMoodLiveSuggestions: true,
  autoMoodInheritFromChat: true,
  autoMoodAIEnabled: true,
  autoMoodAIOnBlur: true,
  autoMoodAIOnPause: true,
  autoTags: true,
  autoScreenshot: false,
  autoScreenshotBlurPrivate: true,
  openrouterApiKey: '',
  minimaxApiKey: '',
};

// Storage key
const AI_SETTINGS_KEY = 'daybook-ai-settings';

// Load AI settings from localStorage
export function loadAISettings(): AISettings {
  try {
    const stored = localStorage.getItem(AI_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_AI_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load AI settings:', e);
  }
  return DEFAULT_AI_SETTINGS;
}

// Save AI settings to localStorage
export function saveAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save AI settings:', e);
  }
}

// Get model for a profile and provider - used when making API calls
export function getModelForProfile(profile: AIProfile, provider?: AIProvider): string {
  const p = provider || loadAISettings().provider || 'lovable';
  return PROVIDER_MODELS[p][profile];
}

// Get profile config
export function getProfileConfig(profile: AIProfile): AIProfileConfig {
  return AI_PROFILES[profile];
}

// Get current provider
export function getCurrentProvider(): AIProvider {
  return loadAISettings().provider || 'lovable';
}
