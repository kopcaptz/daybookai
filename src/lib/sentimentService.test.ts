// Sentiment Service Tests
// Tests for predictive mood tracking logic

import { describe, it, expect } from 'vitest';
import { analyzeSentimentLocal } from './sentimentService';

describe('analyzeSentimentLocal', () => {
  describe('emoji detection', () => {
    it('detects very positive emojis (mood 5)', () => {
      const result = analyzeSentimentLocal('Сегодня был отличный день! 🎉');
      expect(result.mood).toBe(5);
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.source).toBe('local');
    });

    it('detects positive emojis (mood 4)', () => {
      const result = analyzeSentimentLocal('Неплохо 🙂');
      expect(result.mood).toBe(4);
      expect(result.source).toBe('local');
    });

    it('detects neutral emojis (mood 3)', () => {
      const result = analyzeSentimentLocal('Думаю... 🤔');
      expect(result.mood).toBe(3);
      expect(result.source).toBe('local');
    });

    it('detects negative emojis (mood 2)', () => {
      const result = analyzeSentimentLocal('Устал 😔');
      expect(result.mood).toBe(2);
      expect(result.source).toBe('local');
    });

    it('detects very negative emojis (mood 1)', () => {
      const result = analyzeSentimentLocal('Кошмар 😭😭😭');
      expect(result.mood).toBe(1);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.source).toBe('local');
    });

    it('averages multiple emojis', () => {
      // 🎉 (5) + 🙂 (4) = avg 4.5 → rounds to 5 or 4
      const result = analyzeSentimentLocal('Хорошо! 🎉🙂');
      expect(result.mood).toBeGreaterThanOrEqual(4);
      expect(result.mood).toBeLessThanOrEqual(5);
    });
  });

  describe('Russian keyword detection', () => {
    it('detects positive Russian keywords', () => {
      const result = analyzeSentimentLocal('Сегодня был отличный день! Всё получилось!');
      expect(result.mood).toBeGreaterThanOrEqual(4);
      expect(result.source).toBe('local');
    });

    it('detects negative Russian keywords', () => {
      const result = analyzeSentimentLocal('Очень устал сегодня, всё было тяжело');
      expect(result.mood).toBeLessThanOrEqual(2);
      expect(result.source).toBe('local');
    });

    it('detects happy/success keywords', () => {
      const result = analyzeSentimentLocal('Я счастлив, успех!');
      expect(result.mood).toBeGreaterThanOrEqual(4);
    });

    it('detects sad/problem keywords', () => {
      const result = analyzeSentimentLocal('Грустно, проблемы на работе');
      expect(result.mood).toBeLessThanOrEqual(3);
    });
  });

  describe('English keyword detection', () => {
    it('detects positive English keywords', () => {
      const result = analyzeSentimentLocal('Had an amazing day! Everything was great!');
      expect(result.mood).toBeGreaterThanOrEqual(4);
      expect(result.source).toBe('local');
    });

    it('detects negative English keywords', () => {
      const result = analyzeSentimentLocal('Terrible day, so stressed and tired');
      expect(result.mood).toBeLessThanOrEqual(2);
      expect(result.source).toBe('local');
    });
  });

  describe('edge cases', () => {
    it('returns neutral for empty text', () => {
      const result = analyzeSentimentLocal('');
      expect(result.mood).toBe(3);
      expect(result.confidence).toBe(0);
    });

    it('returns neutral for very short text', () => {
      const result = analyzeSentimentLocal('ok');
      expect(result.mood).toBe(3);
      expect(result.confidence).toBe(0);
    });

    it('returns neutral for text without keywords or emojis', () => {
      const result = analyzeSentimentLocal('Сегодня вторник');
      expect(result.mood).toBe(3);
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('handles text with both negative and positive keywords', () => {
      // Just verify it doesn't crash and returns valid mood
      const result = analyzeSentimentLocal('День был тяжёлый');
      expect(result.mood).toBeGreaterThanOrEqual(1);
      expect(result.mood).toBeLessThanOrEqual(5);
    });
  });

  describe('confidence levels', () => {
    it('has higher confidence with more emojis', () => {
      const single = analyzeSentimentLocal('Круто 🎉');
      const multiple = analyzeSentimentLocal('Круто 🎉🎉🎉');
      
      expect(multiple.confidence).toBeGreaterThan(single.confidence);
    });

    it('has higher confidence with more keywords', () => {
      const few = analyzeSentimentLocal('Хороший день');
      const many = analyzeSentimentLocal('Отличный замечательный прекрасный чудесный день!');
      
      expect(many.confidence).toBeGreaterThan(few.confidence);
    });
  });
});
