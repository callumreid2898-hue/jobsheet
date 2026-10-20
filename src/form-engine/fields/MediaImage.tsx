import { useMediaSrc } from '../../hooks/useMediaSrc';

interface Props { path: string; alt: string; className?: string; }

export function MediaImage({ path, alt, className }: Props) {
  const { src, failed } = useMediaSrc(path);
  if (src) return <img src={src} alt={alt} className={className} />;
  return (
    <div className={`${className ?? ''} flex items-center justify-center bg-gray-100 text-[10px] text-gray-400 text-center`}>
      {failed ? 'Not available offline' : 'Loading…'}
    </div>
  );
}
