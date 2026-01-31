// AI Configuration Types and Constants
// All AI requests go through Edge Functions - no client-side keys needed

export type AIProfile = 'economy' | 'fast' | 'balanced' | 'quality' | 'biography';

export interface AIProfileConfig {
  id: AIProfile;
  name: string;
  description: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

// Profile to model mapping - used when calling Edge Function
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
    maxTokens: 2048,
    temperature: 0.8,
  },
};

export interface AISettings {
  enabled: boolean;
  chatProfile: AIProfile;
  bioProfile: AIProfile;
  strictPrivacy: boolean; // Never quote verbatim, paraphrase only
  autoMood: boolean; // Predictive mood tracking
  autoMoodLiveSuggestions: boolean; // Show live suggestions while typing
  autoMoodInheritFromChat: boolean; // Inherit mood from discussions
  autoTags: boolean; // Auto-suggest tags based on text content
  autoScreenshot: boolean; // Auto-capture screen on FAB open (default: false)
  autoScreenshotBlurPrivate: boolean; // Blur .blur-private elements (default: true)
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  chatProfile: 'balanced',
  bioProfile: 'biography',
  strictPrivacy: true, // ON by default
  autoMood: false, // OFF by default (opt-in)
  autoMoodLiveSuggestions: true, // ON by default (if autoMood enabled)
  autoMoodInheritFromChat: true, // ON by default (if autoMood enabled)
  autoTags: false, // OFF by default (opt-in)
  autoScreenshot: false, // OFF by default (opt-in)
  autoScreenshotBlurPrivate: true, // ON by default
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

// Get model for a profile - used when making API calls
export function getModelForProfile(profile: AIProfile): string {
  return AI_PROFILES[profile].model;
}

// Get profile config
export function getProfileConfig(profile: AIProfile): AIProfileConfig {
  return AI_PROFILES[profile];
}
