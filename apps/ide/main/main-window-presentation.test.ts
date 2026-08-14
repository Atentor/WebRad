import { describe, expect, it, vi } from 'vitest';
import { presentMainWindow, type MainWindowPresentationTarget } from './main-window-presentation';

function presentationTarget(calls: string[]): MainWindowPresentationTarget {
  return {
    maximize: vi.fn(() => {
      calls.push('maximize');
    }),
    show: vi.fn(() => {
      calls.push('show');
    }),
  };
}

describe('main window presentation', () => {
  it('maximizes the IDE before showing it', () => {
    const calls: string[] = [];

    presentMainWindow(presentationTarget(calls), { hidden: false });

    expect(calls).toEqual(['maximize', 'show']);
  });

  it('keeps automated smoke windows hidden', () => {
    const calls: string[] = [];

    presentMainWindow(presentationTarget(calls), { hidden: true });

    expect(calls).toEqual([]);
  });
});
