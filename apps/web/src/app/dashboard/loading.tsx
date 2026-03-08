'use client';

import { DashboardSkeleton } from '@/components/skeletons';

export default function DashboardLoading() {
  return <DashboardSkeleton cardCount={5} />;
}
