import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/AppShell';
import { HomeWrapper } from './components/HomeWrapper';
import { AddEditForm } from './components/AddEditForm';
import { ItemDetail } from './components/ItemDetail';
import { Settings } from './components/Settings';
import { TrashBin } from './components/TrashBin';
import { TermsPage } from './components/legal/TermsPage';
import { PrivacyPage } from './components/legal/PrivacyPage';
import { LicensePage } from './components/legal/LicensePage';
import { SecurityDashboard } from './components/SecurityDashboard';
import { PasswordGenerator } from './components/PasswordGenerator';

export const router = createBrowserRouter([
  // Public legal pages — accessible without login
  { path: 'terms',   Component: TermsPage },
  { path: 'privacy', Component: PrivacyPage },
  { path: 'license', Component: LicensePage },
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: HomeWrapper },
      { path: 'add', Component: AddEditForm },
      { path: 'item/:id', Component: ItemDetail },
      { path: 'edit/:id', Component: AddEditForm },
      { path: 'settings', Component: Settings },
      { path: 'trash', Component: TrashBin },
      { path: 'security', Component: SecurityDashboard },
      { path: 'generator', Component: PasswordGenerator },
    ],
  },
]);

