import type { ReactElement } from 'react';

const configurationGroups = [
  { title: 'Layout', properties: ['Display', 'Spacing', 'Sizing'] },
  { title: 'Typography', properties: ['Font', 'Size', 'Weight'] },
  { title: 'Appearance', properties: ['Color', 'Background', 'Border'] },
] as const;

export function StylesWorkspace(): ReactElement {
  return (
    <section className="wr-styles-workspace" aria-label="Styles editor">
      <header className="wr-styles-header">
        <span className="material-icons wr-styles-header-icon" aria-hidden="true">
          palette
        </span>
        <div>
          <h1>Styles</h1>
          <p>Configure reusable visual styles for project components.</p>
        </div>
        <span className="wr-styles-preview-badge">Visual scaffold</span>
      </header>

      <div className="wr-styles-notice" role="note">
        <span className="material-icons" aria-hidden="true">
          info
        </span>
        <span>
          Style persistence, Tailwind classes, and component assignment will be enabled with the
          Tailwind integration.
        </span>
      </div>

      <div className="wr-styles-body">
        <aside className="wr-style-library" aria-label="Style library">
          <div className="wr-style-section-heading">
            <div>
              <span>Project</span>
              <h2>Style library</h2>
            </div>
            <button type="button" disabled title="Available after Tailwind integration">
              <span className="material-icons" aria-hidden="true">
                add
              </span>
              New style
            </button>
          </div>
          <div className="wr-style-library-empty">
            <span className="material-icons" aria-hidden="true">
              layers
            </span>
            <strong>No styles yet</strong>
            <p>Reusable component styles will appear here.</p>
          </div>
        </aside>

        <div className="wr-style-configurator">
          <div className="wr-style-configurator-heading">
            <div>
              <span>Style configuration</span>
              <h2>Select or create a style</h2>
            </div>
            <span className="wr-style-connection-state">
              <span aria-hidden="true" /> Not connected
            </span>
          </div>

          <div className="wr-style-state-strip" aria-label="Style states">
            {['Default', 'Hover', 'Focus', 'Disabled'].map((state, index) => (
              <span className={index === 0 ? 'active' : ''} key={state}>
                {state}
              </span>
            ))}
          </div>

          <div className="wr-style-configuration-grid" aria-disabled="true">
            {configurationGroups.map((group) => (
              <section className="wr-style-property-group" key={group.title}>
                <h3>{group.title}</h3>
                {group.properties.map((property) => (
                  <div className="wr-style-property-placeholder" key={property}>
                    <span>{property}</span>
                    <span>Not configured</span>
                  </div>
                ))}
              </section>
            ))}
          </div>

          <section className="wr-style-component-preview" aria-label="Component style preview">
            <div className="wr-style-preview-heading">
              <div>
                <span>Preview</span>
                <h3>Component canvas</h3>
              </div>
              <span>100%</span>
            </div>
            <div className="wr-style-preview-canvas">
              <div className="wr-style-preview-card" aria-hidden="true">
                <span>Reusable style</span>
                <strong>Component preview</strong>
                <p>The selected style will be previewed here before it is assigned.</p>
                <span className="wr-style-preview-action">Action</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
