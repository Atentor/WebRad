import type { WebRadProject } from '@webrad/project-model';
import { useState, type ReactElement } from 'react';
import { Panel } from './Panel';

interface ProjectExplorerProps {
  project: WebRadProject | null;
  activeFormId: string | null;
  onOpenForm: (formId: string) => void;
  onAddForm: () => void;
  onDeleteForm: (formId: string) => void;
  onRenameForm: (formId: string, name: string) => void;
}

function FolderGlyph({ open = true }: { open?: boolean }): ReactElement {
  return <span className="wr-tree-glyph">{open ? '▾' : '▸'}</span>;
}

export function ProjectExplorer({
  project,
  activeFormId,
  onOpenForm,
  onAddForm,
  onDeleteForm,
  onRenameForm,
}: ProjectExplorerProps): ReactElement {
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const beginRename = (formId: string, name: string): void => {
    setEditingFormId(formId);
    setDraftName(name);
  };

  const finishRename = (): void => {
    if (editingFormId && draftName.trim()) onRenameForm(editingFormId, draftName.trim());
    setEditingFormId(null);
  };

  return (
    <Panel
      title="Project Explorer"
      actions={
        <button type="button" title="Add form" aria-label="Add form" onClick={onAddForm}>
          ＋
        </button>
      }
    >
      {!project ? (
        <div className="wr-empty-state">Create or open a project to begin.</div>
      ) : (
        <div className="wr-project-tree" role="tree" aria-label={`${project.name} project`}>
          <div className="wr-tree-row wr-project-row" role="treeitem" aria-expanded="true">
            <FolderGlyph />
            <span className="wr-project-icon">W</span>
            <strong>{project.name}</strong>
          </div>
          <div role="group" className="wr-tree-group">
            <div className="wr-tree-row wr-folder-row" role="treeitem" aria-expanded="true">
              <FolderGlyph />
              <span>Forms</span>
              <small>{project.forms.length}</small>
            </div>
            <div role="group" className="wr-tree-group nested">
              {project.forms.map((form) => (
                <div
                  key={form.id}
                  className={`wr-tree-row wr-form-row ${activeFormId === form.id ? 'active' : ''}`}
                  role="treeitem"
                  aria-selected={activeFormId === form.id}
                  onDoubleClick={() => onOpenForm(form.id)}
                  onClick={() => onOpenForm(form.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onOpenForm(form.id);
                    if (event.key === 'F2') beginRename(form.id, form.name);
                    if (event.key === 'Delete') onDeleteForm(form.id);
                  }}
                  tabIndex={0}
                >
                  <span className="wr-form-icon">▱</span>
                  {editingFormId === form.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Enter') finishRename();
                        if (event.key === 'Escape') setEditingFormId(null);
                      }}
                    />
                  ) : (
                    <span>{form.name}</span>
                  )}
                  {project.entryForm === form.id && <small title="Entry form">entry</small>}
                </div>
              ))}
            </div>
            {['Models', 'Units', 'Assets'].map((folder) => (
              <div
                className="wr-tree-row wr-folder-row"
                role="treeitem"
                aria-expanded="false"
                key={folder}
              >
                <FolderGlyph open={false} />
                <span>{folder}</span>
              </div>
            ))}
            <div className="wr-tree-row" role="treeitem">
              <span className="wr-tree-glyph">⚙</span>
              <span>Project Settings</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
