export interface TestingTerminalInput {
  primaryTitle: string;
  onPrimary: () => void | Promise<void>;
}
