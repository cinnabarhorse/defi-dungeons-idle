import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Top Ups | DeFi Dungeon',
};

export default function TopUpsPage() {
  redirect('/me/topup');
}
