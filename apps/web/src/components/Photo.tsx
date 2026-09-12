import { useState } from 'react';
import { ForkIcon } from './Icons';

interface Props {
  /** Photo URL. Undefined = no photo, show the art. */
  src?: string;
  /** CSS background (gradient) shown when there is no photo or it fails to load. */
  fallback: string;
  alt?: string;
  className?: string;
  /** Size of the fork drawn on the fallback art. */
  iconSize?: number;
}

/**
 * Restaurant photo. A light gray ground shows while the image loads; the
 * gradient art with a fork takes over when there is no URL or the load errors.
 */
export function Photo({ src, fallback, alt = '', className = '', iconSize = 24 }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const cls = `photo${className ? ` ${className}` : ''}`;

  if (!src || failedSrc === src) {
    return (
      <div className={`${cls} photo--art`} style={{ background: fallback }} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
        <ForkIcon size={iconSize} stroke="rgba(255,255,255,0.92)" strokeWidth={1.8} />
      </div>
    );
  }

  return (
    <div className={cls}>
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
    </div>
  );
}
