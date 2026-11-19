import type { RouteObject } from 'react-router';

import { App } from '../App';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { PrivacyPage } from './PrivacyPage';
import { RouteError } from './RouteError';
import { TermsPage } from './TermsPage';
import { TestimonialListPage } from './TestimonialListPage';
import { TestimonialSubmitPage } from './TestimonialSubmitPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: App,
    children: [
      {
        // A route that throws shows RouteError inside the App layout,
        // instead of React Router's default error screen.
        ErrorBoundary: RouteError,
        children: [
          {
            index: true,
            Component: HomePage,
          },
          {
            path: 'testimonial/submit',
            Component: TestimonialSubmitPage,
          },
          {
            path: 'testimonial/list',
            Component: TestimonialListPage,
          },
          {
            path: 'privacy',
            Component: PrivacyPage,
          },
          {
            path: 'terms',
            Component: TermsPage,
          },
          {
            path: '*',
            Component: NotFoundPage,
          },
        ],
      },
    ],
  },
];
