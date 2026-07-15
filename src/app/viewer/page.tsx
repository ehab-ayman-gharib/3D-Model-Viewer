'use client';

import dynamic from 'next/dynamic';

const Ultimate3DViewer = dynamic(
  () => import('../../components/Ultimate3DViewer').then((mod) => mod.default),
  { ssr: false }
);

export default function ViewerPage() {
    return (
        <main className="w-screen h-screen overflow-hidden bg-transparent">
            <Ultimate3DViewer />
        </main>
    );
}
