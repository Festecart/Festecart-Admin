import { documentId } from 'firebase/firestore'
import { collection, db, getDocs, query, where } from '@/lib/firebase'
import type { AdminCategory, AdminProduct } from '@/lib/products'
import type { FestivalTag } from '@/types/accounts'

export const FESTIVAL_CATEGORIES = [
  'Deepavali',
  'Tulasi Pooja',
  'Ayudha Pooja',
  'Sathyanarayana Swamy Pooja',
  'Ugadi',
  'Makara Sankranthi / Pongal',
  'Janmotsava (Birthday)',
  'Holi',
  'Raksha Bandhan',
] as const
export const LEGACY_FINANCIAL_TAGS = FESTIVAL_CATEGORIES.slice(0, 6)

export type FestivalCategory = (typeof FESTIVAL_CATEGORIES)[number]

export interface FestivalProduct {
  id: string
  name: string
}

const CATEGORY_ALIASES: Record<FestivalCategory, string[]> = {
  Deepavali: ['deepavali', 'diwali'],
  'Tulasi Pooja': ['tulasipooja', 'tulasi', 'tulsipooja', 'tulsi', 'tulasipuja', 'tulsipuja'],
  'Ayudha Pooja': ['ayudhpooja', 'ayudhapooja', 'ayudhapuja', 'ayudhpuja', 'ayudha', 'ayudha-puja'],
  'Sathyanarayana Swamy Pooja': [
    'sathyanarayanaswamypooja',
    'sathyanarayanaswamypuja',
    'sathyanarayanaswamipooja',
    'sathyanarayanaswamipuja',
    'satyanarayanaswamypooja',
    'satyanarayanaswamypuja',
    'satyanarayanaswamipooja',
    'satyanarayanaswamipuja',
    'sathyanarayana',
    'satyanarayana',
  ],
  Ugadi: ['ugadi', 'yugadi'],
  'Makara Sankranthi / Pongal': ['makarasankranthi', 'makarasankranti', 'sankranthi', 'sankranti', 'pongal'],
  'Janmotsava (Birthday)': ['janmotsava', 'janmotsav', 'janmautsava', 'birthday'],
  Holi: ['holi', 'holika'],
  'Raksha Bandhan': ['rakshabandhan', 'rakshabandhanam', 'rakhi'],
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
}

export function getFestivalCategory(value: string): FestivalCategory | null {
  const normalized = normalizeName(value)
  return FESTIVAL_CATEGORIES.find(category =>
    normalizeName(category) === normalized ||
    CATEGORY_ALIASES[category].some(alias => normalized.includes(normalizeName(alias))),
  ) ?? null
}

export function festivalTagId(value: string): string {
  const canonicalName = getFestivalCategory(value) ?? value.trim()
  return canonicalName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function resolveFestivalTagName(
  tagId: string | null,
  storedName: string | null,
  tags: FestivalTag[],
): string | null {
  const id = tagId || (storedName ? festivalTagId(storedName) : '')
  return tags.find(tag => tag.id === id)?.name ?? storedName
}

export function categoryNameMatchesFestival(value: string, festival: FestivalCategory): boolean {
  const normalized = normalizeName(value)
  return CATEGORY_ALIASES[festival].some(alias => normalized.includes(normalizeName(alias)))
}

export function festivalTagMatches(value: string | null, filter: string): boolean {
  if (!value) return false
  const actualCategory = getFestivalCategory(value)
  const filterCategory = getFestivalCategory(filter)
  if (actualCategory || filterCategory) return actualCategory === filterCategory
  return normalizeName(value) === normalizeName(filter)
}

export function filterAdminProductsByFestival(
  festival: FestivalCategory,
  products: AdminProduct[],
  categories: AdminCategory[],
): AdminProduct[] {
  const categoryIds = new Set(
    categories
      .filter(category =>
        categoryNameMatchesFestival(category.name ?? '', festival) ||
        categoryNameMatchesFestival(category.slug ?? '', festival),
      )
      .map(category => category.id),
  )

  let hasNewCategory = true
  while (hasNewCategory) {
    hasNewCategory = false
    for (const category of categories) {
      if (category.parent_id && categoryIds.has(category.parent_id) && !categoryIds.has(category.id)) {
        categoryIds.add(category.id)
        hasNewCategory = true
      }
    }
  }

  return products.filter(product => product.category_id != null && categoryIds.has(product.category_id))
}

export function mergeFestivalProductSelectionsByCategory(
  tags: readonly { id: string; name: string }[],
  savedSelections: Record<string, string[]>,
  products: AdminProduct[],
  categories: AdminCategory[],
): Record<string, string[]> {
  const selections = Object.fromEntries(
    Object.entries(savedSelections).map(([tagId, productIds]) => [tagId, [...new Set(productIds)]]),
  )

  for (const tag of tags) {
    const festival = getFestivalCategory(tag.name)
    if (!festival) continue

    const categoryProductIds = filterAdminProductsByFestival(festival, products, categories)
      .map(product => product.id)
    selections[tag.id] = [...new Set([...(selections[tag.id] ?? []), ...categoryProductIds])]
  }

  return selections
}

export async function fetchFestivalProductsByIds(productIds: string[]): Promise<FestivalProduct[]> {
  const uniqueIds = [...new Set(productIds.filter(id => id.trim()))]
  const products: FestivalProduct[] = []
  for (let index = 0; index < uniqueIds.length; index += 30) {
    const ids = uniqueIds.slice(index, index + 30)
    const snapshot = await getDocs(query(collection(db, 'products'), where(documentId(), 'in', ids)))
    for (const document of snapshot.docs) {
      const name = document.data().name
      if (typeof name === 'string' && name.trim()) products.push({ id: document.id, name: name.trim() })
    }
  }
  return products.sort((left, right) => left.name.localeCompare(right.name))
}
