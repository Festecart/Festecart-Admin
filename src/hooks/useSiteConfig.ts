import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db, doc, getDoc, setDoc, Timestamp } from '@/lib/firebase'

// site_config is stored as individual documents in the 'site_config' collection
// Each document ID is the config key (e.g. 'announcement_bar', 'nav_links', …)

export function useSiteConfig(key: string) {
  return useQuery({
    queryKey: ['site_config', key],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'site_config', key))
      if (!snap.exists()) return null
      return snap.data()?.value ?? null
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpdateSiteConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      await setDoc(
        doc(db, 'site_config', key),
        { value, updated_at: Timestamp.now() },
        { merge: true },
      )
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['site_config', variables.key] })
    },
  })
}
