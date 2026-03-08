'use client';

import React, { Component, ReactNode, ErrorInfo } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
  section?: 'recording' | 'upload' | 'share' | 'dashboard' | 'general';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const sectionConfig = {
  recording: {
    title: 'Recording Error',
    description: 'Something went wrong while recording. Your recording has been saved locally.',
    icon: '🎬',
  },
  upload: {
    title: 'Upload Error',
    description: 'Failed to upload your recording. Please check your connection and try again.',
    icon: '☁️',
  },
  share: {
    title: 'Playback Error',
    description: 'Unable to load the video. The link may be invalid or expired.',
    icon: '▶️',
  },
  dashboard: {
    title: 'Dashboard Error',
    description: 'Failed to load your recordings. Please try again.',
    icon: '📁',
  },
  general: {
    title: 'Something went wrong',
    description: 'We apologize for the inconvenience. Please try again.',
    icon: '😵',
  },
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to Sentry
    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
        section: this.props.section || 'general',
      },
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const config = sectionConfig[this.props.section || 'general'];
      const { error } = this.state;

      return (
        <div 
          className="min-h-[400px] bg-slate-900 flex items-center justify-center p-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="text-center max-w-lg px-4">
            <div className="text-6xl mb-4" aria-hidden="true">
              {config.icon}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {config.title}
            </h2>
            <p className="text-slate-400 mb-6">
              {config.description}
            </p>
            
            {process.env.NODE_ENV === 'development' && error && (
              <div className="text-left bg-slate-800 p-4 rounded-lg mb-6 overflow-auto max-w-lg">
                <p className="text-red-400 text-sm font-mono mb-2">
                  {error.message}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-slate-500 text-xs whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
            
            <div className="flex gap-4 justify-center flex-wrap">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                aria-label="Try again"
              >
                Try again
              </button>
              <Link
                href="/"
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                Go home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for using error boundary in functional components
export function useErrorHandler(): (error: Error) => void {
  return (error: Error) => {
    Sentry.captureException(error);
  };
}
