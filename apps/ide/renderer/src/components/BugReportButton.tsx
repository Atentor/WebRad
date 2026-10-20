import { useState, type ReactElement } from 'react';

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
        <svg
          className="wr-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M9 4 7 2m8 2 2-2M4 7l3 2m13-2-3 2M3 13h4m10 0h4M4 19l3-2m13 2-3-2M9 8V7a3 3 0 0 1 6 0v1" />
          <path d="M7 8h10v7a5 5 0 0 1-10 0Zm5 0v12M7 12h10" />
        </svg>
      </button>
      {error && (
        <span className="wr-bug-report-error" role="alert">
          Could not open the browser. Please try again.
        </span>
      )}
    </span>
  );
}
