import { useContext } from 'react';
import { HeroTransitionContext } from '@/components/HeroTransition';

export function useHeroTransition() {
  const context = useContext(HeroTransitionContext);
  
  if (!context) {
    throw new Error('useHeroTransition must be used within HeroTransitionProvider');
  }
  
  return context;
}
