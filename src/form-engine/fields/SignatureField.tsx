import { useRef, useEffect, useCallback } from 'react';
import SignaturePad from 'signature_pad';
import type { FieldDef } from '../../templates/types';
import type { FieldAnswer, SignatureRef } from '../../types';

interface Props { field: FieldDef; value: FieldAnswer; onChange: (v: FieldAnswer) => void; readOnly: boolean; error?: string; }

export function SignatureField({ field, value, onChange, readOnly, error }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const sigRef = value as SignatureRef | null;

  const initPad = useCallback(() => {
    if (!canvasRef.current || readOnly) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);
    padRef.current = new SignaturePad(canvas, { backgroundColor: 'rgb(255, 255, 255)' });
    if (sigRef?.storage_path?.startsWith('data:')) {
      padRef.current.fromDataURL(sigRef.storage_path);
    }
  }, [readOnly, sigRef]);

  useEffect(() => {
    initPad();
    return () => { padRef.current?.off(); };
  }, [initPad]);

  function clear() {
    padRef.current?.clear();
    onChange(null);
  }

  function capture() {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const dataUrl = padRef.current.toDataURL('image/png');
    const sig: SignatureRef = { storage_path: dataUrl, captured_at: new Date().toISOString() };
    onChange(sig);
  }

  if (readOnly && sigRef) {
    return (
      <div className="px-4 py-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
        <img
          src={sigRef.storage_path}
          alt="Signature"
          className="border border-gray-200 rounded-lg max-h-24 bg-white"
        />
        <p className="text-xs text-gray-500 mt-1">Signed {new Date(sigRef.captured_at).toLocaleString()}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3" data-error={!!error}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {sigRef ? (
        <div>
          <img src={sigRef.storage_path} alt="Signature" className="border rounded-lg max-h-24 bg-white mb-2" />
          {!readOnly && (
            <button type="button" onClick={clear} className="text-sm text-red-500 hover:text-red-700">Clear signature</button>
          )}
        </div>
      ) : (
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-32 touch-none bg-white"
            style={{ touchAction: 'none' }}
          />
          <div className="flex gap-2 p-2 bg-gray-50 border-t border-gray-200">
            <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-300 rounded">Clear</button>
            <button type="button" onClick={capture} className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded ml-auto">Save signature</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
