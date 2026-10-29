import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchOneCached } from '../../lib/cachedQuery';
import { writeRecord } from '../../lib/writeRecord';
import { Input, Textarea } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import type { Customer } from '../../types';

const EMPTY = { name: '', contact_name: '', contact_email: '', contact_phone: '', billing_address: '', notes: '' };

export function EditCustomerPage() {
  const navigate = useNavigate();
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    fetchOneCached<Customer>('customers', customerId).then(c => {
      setCustomer(c);
      if (c) {
        setForm({
          name: c.name, contact_name: c.contact_name ?? '', contact_email: c.contact_email ?? '',
          contact_phone: c.contact_phone ?? '', billing_address: c.billing_address ?? '', notes: c.notes ?? '',
        });
      }
      setLoading(false);
    });
  }, [customerId]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    setSaving(true);
    const text = (v: string) => v.trim() || null;
    const { status } = await writeRecord('customers', 'update', {
      id: customer.id,
      name: form.name.trim(),
      contact_name: text(form.contact_name),
      contact_email: text(form.contact_email),
      contact_phone: text(form.contact_phone),
      billing_address: text(form.billing_address),
      notes: text(form.notes),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (status !== 'failed') navigate(`/manager/customers/${customer.id}`, { replace: true });
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!customer) return <p className="text-center text-gray-400 py-12">Customer not found</p>;

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl">
      <button onClick={() => navigate(-1)} className="text-blue-600 text-sm mb-4 inline-block">‹ Back</button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Edit customer</h1>
      <form onSubmit={handleSubmit}>
        <Input label="Name" required value={form.name} onChange={set('name')} />
        <Input label="Contact name" value={form.contact_name} onChange={set('contact_name')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Contact email" type="email" value={form.contact_email} onChange={set('contact_email')} />
          <Input label="Contact phone" type="tel" value={form.contact_phone} onChange={set('contact_phone')} />
        </div>
        <Textarea label="Billing address" value={form.billing_address} onChange={set('billing_address')} rows={2} />
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} />
        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl text-base disabled:opacity-60">
          {saving ? 'Saving…' : 'Save customer'}
        </button>
      </form>
    </div>
  );
}
