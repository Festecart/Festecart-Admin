import * as Select from '@radix-ui/react-select'
import { ChevronDown, ChevronUp } from 'lucide-react'

const EMPTY_VALUE = '__accounts_select_empty__'

export function AccountsSelect({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  required = false,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  required?: boolean
}) {
  return (
    <Select.Root
      value={value || EMPTY_VALUE}
      onValueChange={selected => onChange(selected === EMPTY_VALUE ? '' : selected)}
      required={required}
    >
      <Select.Trigger aria-label={ariaLabel} aria-required={required}
        className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left font-normal">
        <Select.Value placeholder={placeholder} />
        <Select.Icon><ChevronDown size={16} className="text-slate-500" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          side="bottom"
          sideOffset={4}
          className="z-[70] max-h-[70vh] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <Select.ScrollUpButton className="flex items-center justify-center py-1 text-slate-500">
            <ChevronUp size={14} />
          </Select.ScrollUpButton>
          <Select.Viewport className="p-1">
            <Select.Item value={EMPTY_VALUE}
              className="relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-slate-500 outline-none data-[highlighted]:bg-slate-100">
              <Select.ItemText>{placeholder}</Select.ItemText>
            </Select.Item>
            {options.map(option => (
              <Select.Item key={option.value} value={option.value}
                className="relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-slate-800 outline-none data-[highlighted]:bg-slate-100 data-[state=checked]:bg-slate-900 data-[state=checked]:text-white">
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="flex items-center justify-center py-1 text-slate-500">
            <ChevronDown size={14} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
