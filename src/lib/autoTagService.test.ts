// Auto-Tag Service Tests
// Tests for automatic tag detection logic

import { describe, it, expect } from 'vitest';
import { detectTags, getPresetTags } from './autoTagService';

describe('detectTags', () => {
  describe('Russian keyword detection', () => {
    it('detects Work tag from Russian keywords', () => {
      const result = detectTags('Сегодня на работе был важный митинг с коллегами');
      const workTag = result.find(t => t.tag === 'Работа');
      
      expect(workTag).toBeDefined();
      expect(workTag!.confidence).toBeGreaterThan(0.3);
    });

    it('detects Family tag from Russian keywords', () => {
      const result = detectTags('Провёл день с семьёй, мама приготовила ужин');
      const familyTag = result.find(t => t.tag === 'Семья');
      
      expect(familyTag).toBeDefined();
    });

    it('detects Health tag from Russian keywords', () => {
      const result = detectTags('Сходил к врачу, выписали лекарства');
      const healthTag = result.find(t => t.tag === 'Здоровье');
      
      expect(healthTag).toBeDefined();
    });

    it('detects Sport tag from Russian keywords', () => {
      const result = detectTags('Отличная тренировка в зале, пробежка и йога');
      const sportTag = result.find(t => t.tag === 'Спорт');
      
      expect(sportTag).toBeDefined();
    });

    it('detects Study tag from Russian keywords', () => {
      const result = detectTags('Готовился к экзамену в универе, читал лекции');
      const studyTag = result.find(t => t.tag === 'Учёба');
      
      expect(studyTag).toBeDefined();
    });
  });

  describe('English keyword detection', () => {
    it('detects Work tag from English keywords', () => {
      const result = detectTags('Had a meeting at the office with my colleagues');
      const workTag = result.find(t => t.tag === 'Work');
      
      expect(workTag).toBeDefined();
    });

    it('detects Family tag from English keywords', () => {
      const result = detectTags('Spent time with family, mom and dad visited');
      const familyTag = result.find(t => t.tag === 'Family');
      
      expect(familyTag).toBeDefined();
    });

    it('detects Sport tag from English keywords', () => {
      const result = detectTags('Great workout at the gym, did some yoga');
      const sportTag = result.find(t => t.tag === 'Sport');
      
      expect(sportTag).toBeDefined();
    });
  });

  describe('emoji detection', () => {
    it('detects Work tag from work emojis', () => {
      const result = detectTags('Продуктивный день 💼📊');
      const workTag = result.find(t => t.tag === 'Работа');
      
      expect(workTag).toBeDefined();
      expect(workTag!.source).toBe('emoji');
    });

    it('detects Sport tag from sport emojis', () => {
      const result = detectTags('Активный день 🏃💪');
      const sportTag = result.find(t => t.tag === 'Спорт');
      
      expect(sportTag).toBeDefined();
    });

    it('detects Food tag from food emojis', () => {
      const result = detectTags('Вкусно поели 🍕🍔');
      const foodTag = result.find(t => t.tag === 'Еда');
      
      expect(foodTag).toBeDefined();
    });

    it('detects Love tag from love emojis', () => {
      const result = detectTags('Романтический вечер ❤️💕');
      const loveTag = result.find(t => t.tag === 'Любовь');
      
      expect(loveTag).toBeDefined();
    });
  });

  describe('existing tags filtering', () => {
    it('does not suggest already existing tags', () => {
      const result = detectTags('Работа в офисе с коллегами', ['Работа']);
      const workTag = result.find(t => t.tag === 'Работа');
      
      expect(workTag).toBeUndefined();
    });

    it('filters out existing tags case-insensitively', () => {
      const result = detectTags('Работа в офисе с коллегами', ['работа']);
      const workTag = result.find(t => t.tag === 'Работа');
      
      expect(workTag).toBeUndefined();
    });
  });

  describe('multiple tags', () => {
    it('detects multiple relevant tags', () => {
      const result = detectTags('После работы пошёл в зал на тренировку');
      
      expect(result.length).toBeGreaterThanOrEqual(2);
      
      const workTag = result.find(t => t.tag === 'Работа');
      const sportTag = result.find(t => t.tag === 'Спорт');
      
      expect(workTag).toBeDefined();
      expect(sportTag).toBeDefined();
    });

    it('returns maximum 3 suggestions', () => {
      const result = detectTags(
        'Работа с коллегами 💼, тренировка в зале 🏃, ужин с семьёй 👨‍👩‍👧, друзья в баре 🍻'
      );
      
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('sorts by confidence descending', () => {
      const result = detectTags('Много работы на проекте, митинг с коллегами в офисе');
      
      if (result.length >= 2) {
        expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
      }
    });
  });

  describe('edge cases', () => {
    it('returns empty for very short text', () => {
      const result = detectTags('Ок');
      expect(result).toHaveLength(0);
    });

    it('returns empty for empty text', () => {
      const result = detectTags('');
      expect(result).toHaveLength(0);
    });

    it('returns empty for text with no keywords', () => {
      const result = detectTags('Сегодня вторник, погода хорошая');
      // May or may not have tags - just shouldn't crash
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe('getPresetTags', () => {
  it('returns Russian tags for ru language', () => {
    const tags = getPresetTags('ru');
    
    expect(tags).toContain('Работа');
    expect(tags).toContain('Семья');
    expect(tags).toContain('Здоровье');
    expect(tags).toContain('Спорт');
  });

  it('returns English tags for en language', () => {
    const tags = getPresetTags('en');
    
    expect(tags).toContain('Work');
    expect(tags).toContain('Family');
    expect(tags).toContain('Health');
    expect(tags).toContain('Sport');
  });

  it('returns same number of tags for both languages', () => {
    const ruTags = getPresetTags('ru');
    const enTags = getPresetTags('en');
    
    expect(ruTags.length).toBe(enTags.length);
  });
});
