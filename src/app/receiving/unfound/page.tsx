/** /receiving/unfound — relocated. */

import { redirect } from 'next/navigation';

export default function UnfoundPage() {
  redirect('/incoming');
}
