import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const fieldClass = (error?: string) =>
  `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'} disabled:bg-gray-50`;

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label?: string; required?: boolean }) {
  if (!label) return null;
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

function FieldNote({ hint, error }: { hint?: string; error?: string }) {
  if (error) return <p className="text-xs text-red-500 mt-1">{error}</p>;
  return hint ? <p className="text-xs text-gray-500 mt-1">{hint}</p> : null;
}

export function Input({ label, hint, error, className = '', id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="mb-4">
      <FieldLabel htmlFor={inputId} label={label} required={props.required} />
      <input {...props} id={inputId} className={`${fieldClass(error)} ${className}`} />
      <FieldNote hint={hint} error={error} />
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Textarea({ label, hint, error, className = '', id, rows = 3, ...props }: TextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="mb-4">
      <FieldLabel htmlFor={inputId} label={label} required={props.required} />
      <textarea {...props} id={inputId} rows={rows} className={`${fieldClass(error)} resize-none ${className}`} />
      <FieldNote hint={hint} error={error} />
    </div>
  );
}
