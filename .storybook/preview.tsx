import type { Preview } from '@storybook/nextjs-vite';
import { designTokenStyleText } from '@/styles/tokens';
import { themePaletteStyleText } from '@/design-system/themes/registry';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <>
        <style>{designTokenStyleText}</style>
        <style>{themePaletteStyleText}</style>
        <div className="min-h-screen bg-surface-canvas p-6 text-text-default">
          <Story />
        </div>
      </>
    ),
  ],
};

export default preview;
