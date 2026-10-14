import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Doorman',
  description: 'Self-hosted Discord welcome bot dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
