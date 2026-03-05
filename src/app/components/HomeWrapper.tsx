import { useOutletContext } from 'react-router';
import { PasswordList } from './PasswordList';

export function HomeWrapper() {
  const { onLock } = useOutletContext<{ onLock: () => void }>();
  return <PasswordList onLock={onLock} />;
}
