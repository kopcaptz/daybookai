import { describe, expect, it } from 'vitest';
import { resolveRouteSurface } from './routeSurfaceRegistry';

describe('routeSurfaceRegistry', () => {
  it.each([
    ['/', { id: 'today', showBottomNav: true, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/calendar', { id: 'calendar', showBottomNav: true, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/search', { id: 'search', showBottomNav: true, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/chat', { id: 'chat', showBottomNav: true, showFloatingChatButton: false, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/discussions', { id: 'discussions', showBottomNav: true, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'select-entries-for-discussion' }],
    ['/discussions/123', { id: 'discussion-detail', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: false, centerActionPolicy: 'new-entry-default' }],
    ['/settings', { id: 'settings', showBottomNav: true, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/new', { id: 'new-entry', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: false, centerActionPolicy: 'new-entry-default' }],
    ['/entry/1', { id: 'entry-edit', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: false, centerActionPolicy: 'new-entry-default' }],
    ['/day/2026-04-02', { id: 'day-view', showBottomNav: true, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/receipts', { id: 'receipts', showBottomNav: false, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/receipts/scan', { id: 'receipt-scan', showBottomNav: false, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/receipts/1', { id: 'receipt-detail', showBottomNav: false, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/reminder/1', { id: 'reminder-detail', showBottomNav: true, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/onboarding', { id: 'onboarding', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: false, centerActionPolicy: 'new-entry-default' }],
    ['/auth', { id: 'auth', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
    ['/admin', { id: 'admin-login', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: false, centerActionPolicy: 'new-entry-default' }],
    ['/admin/dashboard', { id: 'admin-dashboard', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: false, centerActionPolicy: 'new-entry-default' }],
    ['/e/home', { id: 'ethereal-home', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: false, centerActionPolicy: 'new-entry-default' }],
    ['/e/chat', { id: 'ethereal-chat', showBottomNav: false, showFloatingChatButton: false, showFeedbackTrigger: false, centerActionPolicy: 'new-entry-default' }],
    ['/totally-unknown', { id: 'fallback', showBottomNav: true, showFloatingChatButton: true, showFeedbackTrigger: true, centerActionPolicy: 'new-entry-default' }],
  ])('resolves %s with expected shell policy', (pathname, expected) => {
    const spec = resolveRouteSurface(pathname as string);

    expect(spec.id).toBe(expected.id);
    expect(spec.showBottomNav).toBe(expected.showBottomNav);
    expect(spec.showFloatingChatButton).toBe(expected.showFloatingChatButton);
    expect(spec.showFeedbackTrigger).toBe(expected.showFeedbackTrigger);
    expect(spec.centerActionPolicy).toBe(expected.centerActionPolicy);
  });
});
