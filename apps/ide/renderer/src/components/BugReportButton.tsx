import { useState, type ReactElement } from 'react';
import { Icon } from './Icon';

export function BugReportButton(): ReactElement {
  const [error, setError] = useState(false);
  const reportBug = async (): Promise<void> => {
    setError(false);
    try {
      await window.webrad.links.open('issues');
    } catch {
      setError(true);
    }
  };
  return (
    <span className="wr-bug-report">
      <button
        className="wr-toolbar-report-bug"
        type="button"
        title="Report a bug — opens GitHub Issues in your browser"
        aria-label="Report a bug"
        onClick={() => void reportBug()}
      >
        <Icon name="bug" />
      </button>
      {error && (
        <span className="wr-bug-report-error" role="alert">
          Could not open the browser. Please try again.
        </span>
      )}
    </span>
  );
}
