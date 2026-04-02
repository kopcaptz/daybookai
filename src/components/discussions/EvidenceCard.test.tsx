import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EvidenceCard, EvidenceList } from './EvidenceCard';
import type { EvidenceRef } from '@/lib/librarian/contextPack';
import { I18nProvider } from '@/lib/i18n';

function renderCard(evidence: EvidenceRef) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <EvidenceCard evidence={evidence} />
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('EvidenceCard', () => {
  it('shows explicit class labels for entry and biography evidence', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <div>
            <EvidenceCard
              evidence={{
                type: 'entry',
                id: 'E1',
                title: 'Entry title',
                snippet: 'Entry snippet',
                deepLink: '/entry/1',
                entityId: 1,
              }}
            />
            <EvidenceCard
              evidence={{
                type: 'biography',
                id: 'B1',
                title: 'Chronicle title',
                snippet: 'Chronicle snippet',
                deepLink: '/day/2026-04-01',
                entityId: 0,
                biographyDate: '2026-04-01',
                supportedByEvidenceIds: ['E1', 'E2'],
                knownSourceEntryCount: 2,
              }}
            />
          </div>
        </MemoryRouter>
      </I18nProvider>
    );

    expect(screen.getByText('Diary entry')).toBeInTheDocument();
    expect(screen.getByText('Derived chronicle')).toBeInTheDocument();
    expect(screen.getByText('Grounded in E1, E2')).toBeInTheDocument();
  });

  it('groups evidence list by evidence class', () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <EvidenceList
            evidence={[
              {
                type: 'entry',
                id: 'E1',
                title: 'Entry title',
                snippet: 'Entry snippet',
                deepLink: '/entry/1',
                entityId: 1,
              },
              {
                type: 'biography',
                id: 'B1',
                title: 'Chronicle title',
                snippet: 'Chronicle snippet',
                deepLink: '/day/2026-04-01',
                entityId: 0,
                biographyDate: '2026-04-01',
              },
            ]}
            usedIds={['E1', 'B1']}
            maxVisible={4}
          />
        </MemoryRouter>
      </I18nProvider>
    );

    expect(screen.getByText('Evidence used (2)')).toBeInTheDocument();
    expect(screen.getByText('Diary entries')).toBeInTheDocument();
    expect(screen.getByText('Derived chronicles')).toBeInTheDocument();
  });

  it('does not show a class label for non-entry evidence types', () => {
    renderCard({
      type: 'document',
      id: 'D1',
      title: 'Doc title',
      snippet: 'Doc snippet',
      deepLink: '/doc/1',
      entityId: 1,
    });

    expect(screen.queryByText('Diary entry')).not.toBeInTheDocument();
    expect(screen.queryByText('Derived chronicle')).not.toBeInTheDocument();
  });

  it('shows partial provenance for biography evidence when only some grounding entries are visible', () => {
    renderCard({
      type: 'biography',
      id: 'B1',
      title: 'Chronicle title',
      snippet: 'Chronicle snippet',
      deepLink: '/day/2026-04-01',
      entityId: 0,
      biographyDate: '2026-04-01',
      supportedByEvidenceIds: ['E1'],
      knownSourceEntryCount: 3,
    });

    expect(screen.getByText('Grounded in E1, plus 2 source entries not shown here')).toBeInTheDocument();
  });

  it('shows known-but-not-visible provenance for biography evidence', () => {
    renderCard({
      type: 'biography',
      id: 'B1',
      title: 'Chronicle title',
      snippet: 'Chronicle snippet',
      deepLink: '/day/2026-04-01',
      entityId: 0,
      biographyDate: '2026-04-01',
      supportedByEvidenceIds: [],
      knownSourceEntryCount: 2,
    });

    expect(screen.getByText('Grounding entries are known but not shown in this packet')).toBeInTheDocument();
  });
});
