import type { WebRadProject } from '@webrad/project-model';
import { applicationIconUrl } from '../application-assets';
import { Icon } from './Icon';
import { Panel } from './Panel';

interface ProjectToolsProps {
  project: WebRadProject | null;
  stylesActive: boolean;
  onOpenStyles: () => void;
}

export function ProjectTools({ project, stylesActive, onOpenStyles }: ProjectToolsProps) {
  return (
    <Panel title="Project">
      {!project ? (
        <div className="wr-empty-state">Create or open a project to begin.</div>
      ) : (
        <div className="wr-project-tools" role="tree" aria-label={`${project.name} project tools`}>
          <div className="wr-tree-row wr-project-row" role="treeitem" aria-expanded="true">
            <img className="wr-project-icon" src={applicationIconUrl} alt="" aria-hidden="true" />
            <strong>{project.name}</strong>
          </div>
          <div
            className={`wr-tree-row wr-project-tool-row ${stylesActive ? 'active' : ''}`}
            role="treeitem"
            aria-selected={stylesActive}
            title="Open Styles"
            tabIndex={0}
            onClick={onOpenStyles}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenStyles();
              }
            }}
          >
            <Icon name="palette" className="wr-tree-action-icon" />
            <span>Styles</span>
          </div>
          <div className="wr-tree-row" role="treeitem">
            <Icon name="settings" className="wr-tree-glyph" />
            <span>Project Settings</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
