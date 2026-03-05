import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/AppShell';
import { HomeWrapper } from './components/HomeWrapper';
import { AddEditForm } from './components/AddEditForm';
import { ItemDetail } from './components/ItemDetail';
import { Settings } from './components/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: HomeWrapper },
      { path: 'add', Component: AddEditForm },
      { path: 'item/:id', Component: ItemDetail },
      { path: 'edit/:id', Component: AddEditForm },
      { path: 'settings', Component: Settings },
    ],
  },
]);
