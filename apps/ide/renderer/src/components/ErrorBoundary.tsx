import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  area: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    window.dispatchEvent(
      new CustomEvent('webrad:error', {
        detail: {
          category: this.props.area.toUpperCase(),
          message: error.message,
          stack: info.componentStack,
        },
      }),
    );
  }

  public override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="wr-error-boundary" role="alert">
          <strong>{this.props.area} could not be displayed.</strong>
          <span>{this.state.error.message}</span>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
