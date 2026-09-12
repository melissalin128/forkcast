import { Link } from 'react-router-dom';
import { ForkIcon } from './Icons';

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <Link to="/" className="logo" aria-label="Forkcast home">
      <ForkIcon size={size} />
      <span>Forkcast</span>
    </Link>
  );
}
