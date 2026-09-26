import { after } from 'next/server';

/** Schedule work that must outlive the HTTP response — and, on local Node, must not hold the response open until Zoho finishes. */
export function scheduleAfterResponse(work: () => Promise<void>): void {
  const run = () =>
    work().catch((err) => {
      console.error('scheduleAfterResponse failed', err);
    });

  if (process.env.VERCEL === '1') {
    after(run);
    return;
  }

  after(() => {
    void run();
  });
}
