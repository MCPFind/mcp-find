import { notFound } from 'next/navigation';
import Home, { generateMetadata as homeMetadata } from '@/components/directory-home';
import Categories, { metadata as categoriesMetadata } from '@/components/directory-categories';
import Browse, { metadata as browseMetadata } from '@/components/directory-browse';

// Public /, /servers and /categories rewrite here. Empty params deliberately
// defer the first render until a request; successful HTML retains hourly ISR.
export const revalidate = 3600;
export const maxDuration = 15;
export const dynamicParams = true;
export function generateStaticParams(): { surface: string }[] { return []; }
export async function generateMetadata({ params }: { params: { surface: string } }) {
  if (params.surface === 'home') return homeMetadata();
  if (params.surface === 'categories') return categoriesMetadata;
  if (params.surface === 'servers') return browseMetadata;
  notFound();
}
export default function DirectoryRoot({ params }: { params: { surface: string } }) {
  if (params.surface === 'home') return Home();
  if (params.surface === 'categories') return Categories();
  if (params.surface === 'servers') return Browse();
  notFound();
}
