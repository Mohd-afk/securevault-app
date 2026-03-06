import { useOutletContext } from 'react-router';
import { PasswordList } from './PasswordList';
import type { User } from 'firebase/auth';

interface OutletContext {
  onLock: () => void;
  onSignOut: () => void;
  user: User;
}

export function HomeWrapper() {
  const { onLock, onSignOut, user } = useOutletContext<OutletContext>();
  return <PasswordList onLock={onLock} onSignOut={onSignOut} user={user} />;
}
