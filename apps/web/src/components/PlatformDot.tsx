import { PLATFORM_BY_SLUG } from '../data/mock';
import type { PlatformSlug } from '../types';

export function PlatformDot({
  slug,
  size = 'sm',
}: {
  slug: PlatformSlug;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = size === 'sm' ? 'dot' : `dot dot--${size}`;
  return <span className={cls} style={{ background: PLATFORM_BY_SLUG[slug].brandColor }} />;
}
