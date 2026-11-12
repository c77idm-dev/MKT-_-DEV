import type { MetadataRoute } from 'next';
import { manifesto } from '@/lib/manifesto';

export default function manifest(): MetadataRoute.Manifest {
  return manifesto();
}
