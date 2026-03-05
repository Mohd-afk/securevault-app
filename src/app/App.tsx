import { RouterProvider } from 'react-router';
import { router } from './routes';

export default function App() {
  return (
    <div className="dark min-h-screen bg-[#1a1a2e]">
      <RouterProvider router={router} />
    </div>
  );
}
