import React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        ar?: boolean | string;
        'ar-modes'?: string;
        'ar-scale'?: string;
        'auto-rotate'?: boolean | string;
        'camera-controls'?: boolean | string;
        'touch-action'?: string;
        'shadow-intensity'?: string;
        'environment-image'?: string;
        exposure?: string;
        poster?: string;
        loading?: string;
        reveal?: string;
        class?: string;
        style?: React.CSSProperties;
        ref?: React.Ref<any>;
      };
    }
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
          src?: string;
          alt?: string;
          ar?: boolean | string;
          'ar-modes'?: string;
          'ar-scale'?: string;
          'auto-rotate'?: boolean | string;
          'camera-controls'?: boolean | string;
          'touch-action'?: string;
          'shadow-intensity'?: string;
          'environment-image'?: string;
          exposure?: string;
          poster?: string;
          loading?: string;
          reveal?: string;
          class?: string;
          style?: React.CSSProperties;
          ref?: React.Ref<any>;
        };
      }
    }
  }
}
