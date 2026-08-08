import { redirect } from 'next/navigation';

/**
 * `/onboarding` index — thin funnel entry that forwards to the template chooser.
 * Activation gate redirects here-capable paths to `/onboarding/template` directly;
 * this index exists so bookmarks and step hrefs to `/onboarding` resolve.
 */
export default function OnboardingIndexPage() {
  redirect('/onboarding/template');
}
