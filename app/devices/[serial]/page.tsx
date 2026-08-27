import { redirect } from 'next/navigation';
export function generateStaticParams() { return [{ serial: 'selected' }]; }
export default function DeviceRoute() { redirect('/'); }
