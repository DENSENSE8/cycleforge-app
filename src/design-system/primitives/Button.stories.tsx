import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './Button';
import { BUTTON_VARIANTS } from './button-variants';

const meta = {
  title: 'Design System/Primitives/Button',
  component: Button,
  args: {
    children: 'Pack',
    variant: 'primary',
    size: 'md',
    radius: 'surface',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: Object.keys(BUTTON_VARIANTS),
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    radius: { control: 'select', options: ['flush', 'composer', 'surface', 'pill'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Cancel' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Delete' },
};

export const Loading: Story = {
  args: { loading: true, children: 'Saving' },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(BUTTON_VARIANTS) as Array<keyof typeof BUTTON_VARIANTS>).map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};
