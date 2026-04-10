import React from 'react';

interface State {
  hasError: boolean;
  error: string;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: string },
  State
> {
  constructor(props: { children: React.ReactNode; fallback?: string }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            gap: 12,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 40 }}>⚠️</span>
          <strong style={{ color: 'var(--text-primary)' }}>
            {this.props.fallback || 'Something went wrong'}
          </strong>
          <span style={{ fontSize: 13, color: 'var(--danger)' }}>{this.state.error}</span>
          <button
            className="btn btn-ghost"
            onClick={() => this.setState({ hasError: false, error: '' })}
            style={{ marginTop: 8 }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
