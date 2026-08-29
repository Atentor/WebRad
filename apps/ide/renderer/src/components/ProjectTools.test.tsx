// @vitest-environment jsdom

import { createProject } from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectTools } from './ProjectTools';

afterEach(cleanup);

describe('ProjectTools', () => {
  it('opens project settings from the Project panel', () => {
    const onOpenProjectSettings = vi.fn();
    render(
      <ProjectTools
        project={createProject('Portal')}
        stylesActive={false}
        onOpenStyles={vi.fn()}
        onOpenProjectSettings={onOpenProjectSettings}
      />,
    );

    fireEvent.click(screen.getByTitle('Open Project Settings'));
    expect(onOpenProjectSettings).toHaveBeenCalledOnce();
  });
});
