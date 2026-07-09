/**
 * CategoryTreeSelect
 *
 * Dropdown showing categories in a tree:
 * - Parent categories shown as bold section headers (also selectable)
 * - Children indented under their parent
 * - Selected value shown as a removable chip below the dropdown
 * - Search box to filter
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

export interface CategoryItem {
  id: string
  name: string
  parent_id: string | null
  display_order?: number
}

interface TreeNode extends CategoryItem {
  children: TreeNode[]
}

interface Props {
  categories: CategoryItem[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  className?: string
  compact?: boolean  // hides the selected chip — useful when used inline with other content
}

function buildTree(cats: CategoryItem[]): TreeNode[] {
  const map: Record<string, TreeNode> = {}
  cats.forEach(c => { map[c.id] = { ...c, children: [] } })
  const roots: TreeNode[] = []
  cats.forEach(c => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(map[c.id])
    } else {
      roots.push(map[c.id])
    }
  })
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name))
    nodes.forEach(n => sort(n.children))
  }
  sort(roots)
  return roots
}

export default function CategoryTreeSelect({
  categories, value, onChange, placeholder = '— Select Category —', className = '', compact = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const tree = buildTree(categories)
  const selectedName = categories.find(c => c.id === value)?.name ?? ''

  // Flat filtered list when searching
  const filtered = search.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : null

  const handleSelect = (id: string) => {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  // Render tree rows recursively
  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isParent = node.children.length > 0
    const isSelected = node.id === value

    return (
      <div key={node.id}>
        <div
          onClick={() => handleSelect(node.id)}
          className={`flex items-center cursor-pointer transition-colors
            ${isSelected ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-800'}
            ${depth === 0 && isParent ? 'font-semibold' : 'font-normal'}`}
          style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }}
        >
          <span className="text-sm truncate flex-1">{node.name}</span>
        </div>
        {node.children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch('') }}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 text-left"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value ? selectedName : placeholder}
        </span>
        <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100 sticky top-0 bg-white">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search categories…"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-gray-50"
            />
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {/* Clear / placeholder option */}
            <div
              onClick={() => handleSelect('')}
              className={`px-3 py-2 text-sm cursor-pointer italic transition-colors
                ${!value ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-50'}`}
            >
              {placeholder}
            </div>

            {/* Filtered flat list */}
            {filtered ? (
              filtered.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-400 text-center">No categories found</p>
              ) : (
                filtered.map(c => (
                  <div
                    key={c.id}
                    onClick={() => handleSelect(c.id)}
                    className={`px-4 py-2 text-sm cursor-pointer transition-colors
                      ${c.id === value ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-800'}`}
                  >
                    {c.name}
                  </div>
                ))
              )
            ) : (
              // Tree view
              tree.map(node => renderNode(node, 0))
            )}
          </div>
        </div>
      )}

      {/* Selected chip — hidden in compact mode */}
      {value && selectedName && !compact && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-xs px-2.5 py-1 rounded">
            {selectedName}
            <button
              type="button"
              onClick={handleClear}
              className="hover:text-gray-300 transition-colors"
            >
              <X size={11} />
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
