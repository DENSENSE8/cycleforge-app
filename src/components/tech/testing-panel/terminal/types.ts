export interface TestingTerminalInput {
  primaryLabel: string;
  primaryTitle: string;
  primaryDisabled: boolean;
  isPrinting: boolean;
  onPrimary: () => void | Promise<void>;
}
