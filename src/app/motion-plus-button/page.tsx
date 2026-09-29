import { notFound } from 'next/navigation';
import { MotionPlusButtonDemo } from '@/components/demo/MotionPlusButtonDemo';

export default function MotionPlusButtonPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <MotionPlusButtonDemo />;
}
