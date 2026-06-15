import { useState } from 'react'
import { CheckCircle2, Circle, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'

interface Task {
  id: string
  title: string
  priority: 'high' | 'medium' | 'low'
  where: string
  description: string
  sql?: string
  code?: string
  codeLabel?: string
}

const TASKS: Task[] = [
  {
    id: 'payment_status_col',
    priority: 'high',
    title: 'Add payment_status column to orders',
    where: 'Supabase SQL Editor',
    description: 'UPI/card orders need a payment_status column so admin can track paid vs unpaid.',
    sql: `ALTER TABLE public.orders\nADD COLUMN IF NOT EXISTS payment_status text DEFAULT NULL;`,
  },
  {
    id: 'payment_status_trigger',
    priority: 'high',
    title: 'Auto-mark online payments as paid on insert',
    where: 'Supabase SQL Editor',
    description: 'Trigger that sets payment_status = "paid" automatically when a UPI/card order is placed.',
    sql: `CREATE OR REPLACE FUNCTION public.auto_set_payment_status()\nRETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  IF NEW.payment_method IN ('upi', 'card', 'online') THEN\n    NEW.payment_status = 'paid';\n  END IF;\n  RETURN NEW;\nEND;\n$$;\n\nDROP TRIGGER IF EXISTS trg_auto_payment_status ON public.orders;\nCREATE TRIGGER trg_auto_payment_status\nBEFORE INSERT ON public.orders\nFOR EACH ROW EXECUTE FUNCTION public.auto_set_payment_status();`,
  },
  {
    id: 'mark_order_paid_fn',
    priority: 'high',
    title: 'Create mark_order_paid RPC function',
    where: 'Supabase SQL Editor',
    description: 'Needed for the Mark as Paid button in the admin order detail page.',
    sql: `CREATE OR REPLACE FUNCTION public.mark_order_paid(order_id uuid)\nRETURNS void LANGUAGE sql SECURITY DEFINER AS $$\n  UPDATE public.orders SET payment_status = 'paid' WHERE id = order_id;\n$$;`,
  },
  {
    id: 'delivery_pincodes_hook',
    priority: 'high',
    title: 'Replace hardcoded pincodes with useDeliveryPincodes hook',
    where: 'festecart-connect/src/hooks/useDeliveryPincodes.ts',
    description: 'CheckoutPage.tsx has a hardcoded PINCODES object. Replace it so pincodes managed in admin reflect instantly.',
    codeLabel: 'src/hooks/useDeliveryPincodes.ts',
    code: `import { useQuery } from '@tanstack/react-query'\nimport { supabase } from '@/lib/supabase'\n\nexport function useDeliveryPincodes() {\n  return useQuery({\n    queryKey: ['delivery_pincodes'],\n    queryFn: async () => {\n      const { data, error } = await supabase\n        .from('delivery_pincodes')\n        .select('pincode, area_name, shipping_charge')\n        .eq('is_active', true)\n      if (error) throw error\n      return Object.fromEntries(\n        (data ?? []).map(r => [\n          r.pincode,\n          { area: r.area_name, charge: r.shipping_charge }\n        ])\n      )\n    },\n    staleTime: 1000 * 60 * 5,\n  })\n}`,
  },
  {
    id: 'site_config_hook',
    priority: 'medium',
    title: 'Add useSiteConfig hook',
    where: 'festecart-connect/src/hooks/useSiteConfig.ts',
    description: 'Single hook to read any site_config key. Use in Navbar (announcement, nav links) and Footer.',
    codeLabel: 'src/hooks/useSiteConfig.ts',
    code: `import { useQuery } from '@tanstack/react-query'\nimport { supabase } from '@/lib/supabase'\n\nexport function useSiteConfig(key: string) {\n  return useQuery({\n    queryKey: ['site_config', key],\n    queryFn: async () => {\n      const { data, error } = await supabase\n        .from('site_config')\n        .select('value')\n        .eq('key', key)\n        .single()\n      if (error) throw error\n      return data.value\n    },\n    staleTime: 1000 * 60 * 5,\n  })\n}`,
  },
  {
    id: 'navbar_announcement',
    priority: 'medium',
    title: 'Navbar — read announcement bar & nav links from DB',
    where: 'festecart-connect/src/components/Navbar.tsx',
    description: 'Replace hardcoded announcement text and nav links array with live DB values.',
    codeLabel: 'In Navbar.tsx',
    code: `const { data: ann } = useSiteConfig('announcement_bar')\nconst { data: navLinks } = useSiteConfig('nav_links')\n\n// ann?.enabled  → show/hide the bar\n// ann?.left_text → left side text\n// ann?.right_text → right side text\n\n// Nav links:\n// (navLinks ?? []).filter(l => l.enabled).map(l => (\n//   <Link to={l.href}>{l.name}</Link>\n// ))`,
  },
  {
    id: 'footer_config',
    priority: 'medium',
    title: 'Footer — read all sections from DB',
    where: 'festecart-connect/src/components/Footer.tsx',
    description: 'Replace hardcoded footer content with live site_config values.',
    codeLabel: 'In Footer.tsx',
    code: `const { data: contact } = useSiteConfig('footer_contact')\nconst { data: social }  = useSiteConfig('footer_social')\nconst { data: links }   = useSiteConfig('footer_links')\nconst { data: bottom }  = useSiteConfig('footer_bottom')\nconst { data: brand }   = useSiteConfig('footer_brand')\n\n// contact?.address, contact?.phone, contact?.email\n// social?.facebook, social?.instagram, social?.whatsapp\n// (links ?? []).filter(l => l.enabled).map(l => ...)\n// bottom?.copyright_text\n// brand?.tagline`,
  },
  {
    id: 'cart_persistence',
    priority: 'medium',
    title: 'Persist cart to Supabase (enables Abandoned Cart in admin)',
    where: 'festecart-connect/src/store/cartStore.ts',
    description: 'Currently cart is localStorage only. Write to cart_items table so admin sees abandoned carts.',
    codeLabel: 'In cart add/remove/clear functions',
    code: `// Add item:\nawait supabase.from('cart_items').upsert({\n  user_id: session.user.id,\n  product_id: item.product_id,\n  quantity: newQuantity,\n}, { onConflict: 'user_id,product_id' })\n\n// Remove item:\nawait supabase.from('cart_items')\n  .delete()\n  .eq('user_id', session.user.id)\n  .eq('product_id', item.product_id)\n\n// Clear on checkout:\nawait supabase.from('cart_items')\n  .delete()\n  .eq('user_id', session.user.id)`,
  },
  {
    id: 'contact_enquiries_sql',
    priority: 'low',
    title: 'Create contact_enquiries table',
    where: 'Supabase SQL Editor',
    description: 'Needed for the Contact Enquiries page in admin.',
    sql: `CREATE TABLE IF NOT EXISTS public.contact_enquiries (\n  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  name       text,\n  email      text,\n  phone      text,\n  subject    text,\n  message    text,\n  created_at timestamptz NOT NULL DEFAULT now()\n);\nALTER TABLE public.contact_enquiries ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "public_insert_enquiries"\nON public.contact_enquiries FOR INSERT WITH CHECK (true);\n\nCREATE POLICY "admin_read_enquiries"\nON public.contact_enquiries FOR SELECT\nUSING (EXISTS (\n  SELECT 1 FROM public.user_roles\n  WHERE user_id = auth.uid() AND role = 'super_admin'\n));`,
  },
  {
    id: 'contact_form_code',
    priority: 'low',
    title: 'Contact form — write to contact_enquiries table',
    where: 'festecart-connect/src/pages/ContactPage.tsx',
    description: 'On form submit, insert into contact_enquiries so it appears in admin.',
    codeLabel: 'In ContactPage.tsx onSubmit',
    code: `const { error } = await supabase\n  .from('contact_enquiries')\n  .insert({\n    name: form.name,\n    email: form.email,\n    phone: form.phone,\n    subject: form.subject,\n    message: form.message,\n  })\n\nif (error) {\n  setError('Failed to send. Please try again.')\n} else {\n  setSuccess(true)\n}`,
  },
  {
    id: 'category_parent_id',
    priority: 'low',
    title: 'Add parent_id to categories table',
    where: 'Supabase SQL Editor',
    description: 'Enables the nested category tree in admin.',
    sql: `ALTER TABLE public.categories\nADD COLUMN IF NOT EXISTS parent_id uuid\nREFERENCES public.categories(id) ON DELETE SET NULL;`,
  },
]

const PRIORITY_COLOR: Record<string, string> = {
  high:   'bg-gray-900 text-white',
  medium: 'bg-gray-200 text-gray-700',
  low:    'bg-gray-100 text-gray-500',
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200">
        {label && <span className="text-xs font-mono text-gray-500 truncate">{label}</span>}
        <button onClick={copy} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 ml-auto shrink-0">
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono text-gray-800 bg-gray-50 overflow-x-auto whitespace-pre leading-relaxed">{code}</pre>
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  const [done, setDone] = useState(false)
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border border-gray-200 rounded-xl overflow-hidden ${done ? 'opacity-50' : ''}`}>
      <div
        className="flex items-center gap-3 px-4 py-3.5 bg-white cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <button
          onClick={e => { e.stopPropagation(); setDone(d => !d) }}
          className="shrink-0 text-gray-400 hover:text-gray-900"
        >
          {done ? <CheckCircle2 size={18} className="text-black" /> : <Circle size={18} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${PRIORITY_COLOR[task.priority]}`}>
              {task.priority}
            </span>
            <span className={`font-medium text-sm ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.title}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">{task.where}</p>
        </div>
        <span className="text-gray-400 shrink-0">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-white border-t border-gray-100">
          <p className="text-sm text-gray-600 mb-1">{task.description}</p>
          {task.sql && <CodeBlock code={task.sql} label="SQL — run in Supabase SQL Editor" />}
          {task.code && <CodeBlock code={task.code} label={task.codeLabel} />}
        </div>
      )}
    </div>
  )
}

export default function ConnectChecklist() {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const filtered = TASKS.filter(t => filter === 'all' || t.priority === filter)

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Store Checklist</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Fixes needed in <span className="font-mono">festecart-connect</span> to fully connect with this admin panel
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'High priority', count: TASKS.filter(t => t.priority === 'high').length, color: 'bg-gray-900 text-white' },
          { label: 'Medium priority', count: TASKS.filter(t => t.priority === 'medium').length, color: 'bg-gray-200 text-gray-700' },
          { label: 'Low priority', count: TASKS.filter(t => t.priority === 'low').length, color: 'bg-gray-100 text-gray-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
            <span className={`text-lg font-bold px-2 py-0.5 rounded-lg ${s.color}`}>{s.count}</span>
            <span className="text-sm text-gray-600">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {(['all', 'high', 'medium', 'low'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f === 'all' ? `All (${TASKS.length})` : f}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(task => <TaskRow key={task.id} task={task} />)}
      </div>

      <p className="text-xs text-gray-400">Click a task to expand the code/SQL. Check the circle to mark done (resets on refresh).</p>
    </div>
  )
}
