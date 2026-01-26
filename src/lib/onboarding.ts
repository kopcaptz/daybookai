const ONBOARDING_KEY = 'daybook-onboarded';

export function isOnboarded(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

export function setOnboarded(): void {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

export function resetOnboarded(): void {
  localStorage.removeItem(ONBOARDING_KEY);
}
